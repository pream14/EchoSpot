import { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator, FlatList, Alert } from 'react-native';
import MapLibreGL, { MapViewRef, CameraRef } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { MapPin, Plus, RefreshCw, Clock, ChevronRight, X, Play, Pause } from 'lucide-react-native';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface AudioFile {
  _id: string;
  user_id: string;
  file_name: string;
  title: string; // Add optional title field
  location: {
    coordinates?: [number, number]; // GeoJSON format: [longitude, latitude]
    latitude?: number;
    longitude?: number;
    type?: string;
  };
  hidden_until: string;
  created_at: string;
  audio_data: number;
  range?: number;
}

interface VoiceNote {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  file_name: string;
  audioUrl: string;
  isDiscovered: boolean;
  hiddenUntil?: string;
  range?: number;
}

// New interface for grouped notes
interface GroupedMarker {
  id: string;
  latitude: number;
  longitude: number;
  notes: VoiceNote[];
}

const LOCATION_THRESHOLD = 50; // meters
const GROUP_THRESHOLD = 100; // meters for grouping nearby notes
const OSM_TILE_URL = "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"; // OpenStreetMap tile server
const API_URL = "https://echo-trails-backend.vercel.app"; // Replace with your actual API URL
MapLibreGL.setAccessToken(null);

// Initialize MapLibreGL if needed (remove this if already initialized elsewhere in your app)

export default function MapScreen() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<VoiceNote | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hiddenNotes, setHiddenNotes] = useState<VoiceNote[]>([]);
  const [groupedMarkers, setGroupedMarkers] = useState<GroupedMarker[]>([]);
  const [showNotesList, setShowNotesList] = useState(false);
  const [selectedGroupNotes, setSelectedGroupNotes] = useState<VoiceNote[]>([]);
  const soundRef = useRef<Audio.Sound | null>(null);
  const mapRef = useRef<MapViewRef | null>(null);
  const cameraRef = useRef<CameraRef | null>(null);
  
  const router = useRouter();

  useEffect(() => {
    loadMapData();
    
    // Set up timer to check for newly available notes every minute
    const timer = setInterval(checkHiddenNotes, 60000);
    
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
      clearInterval(timer);
    };
  }, []);

  // Watch for changes in voiceNotes to update grouped markers
  useEffect(() => {
    if (voiceNotes.length > 0) {
      updateGroupedMarkers();
    }
  }, [voiceNotes]);

  // Helper function to validate coordinates
  const isValidCoordinate = (lat: any, lng: any): boolean => {
    return (
      lat !== null &&
      lng !== null &&
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      !isNaN(lat) &&
      !isNaN(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180
    );
  };

  // Extract coordinates from potentially different location formats
  const extractCoordinates = (location: any): { latitude: number, longitude: number } | null => {
    try {
      // Check if it's GeoJSON format with coordinates array [longitude, latitude]
      if (location && location.coordinates && Array.isArray(location.coordinates) && location.coordinates.length === 2) {
        // GeoJSON uses [longitude, latitude] order
        return {
          latitude: location.coordinates[1],  // Second value is latitude
          longitude: location.coordinates[0]  // First value is longitude
        };
      } 
      // Check if it has direct latitude/longitude properties
      else if (location && typeof location.latitude === 'number' && typeof location.longitude === 'number') {
        return {
          latitude: location.latitude,
          longitude: location.longitude
        };
      }
      return null;
    } catch (error) {
      console.error('Error extracting coordinates:', error, location);
      return null;
    }
  };

  // Replace the existing loadMapData function with this improved version
  const loadMapData = async () => {
    setLoading(true);
    
    try {
      // Get current location first so it's available sooner
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const currentLocation = await Location.getCurrentPositionAsync({});
        setLocation(currentLocation);
      } else {
        console.warn('Location permission not granted');
      }
      
      // Clear existing voice notes before fetching new ones
      // This ensures deleted notes won't persist
      setVoiceNotes([]);
      setHiddenNotes([]);
      
      // Fetch fresh audio files from the API
      await fetchAudioFilesRefresh();
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setLoading(false);
    }
  };

  // New function specifically for refresh operations
  const fetchAudioFilesRefresh = async () => {
    try {
      // Get the access token from secure storage
      const API_TOKEN = await AsyncStorage.getItem('accessToken');
      
      if (!API_TOKEN) {
        throw new Error('No access token found');
      }
    
      const response = await fetch(`${API_URL}/audio/user/files`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch audio files');
      }
      
      const data = await response.json();
      
      // Process the audio files
      const now = new Date();
      const availableNotes: VoiceNote[] = [];
      const hiddenNotesList: VoiceNote[] = [];
      
      data.audio_files.forEach((file: AudioFile) => {
        // Skip if file has no ID
        if (!file._id) {
          console.warn('Audio file missing ID:', file);
          return;
        }
        
        // Extract coordinates from potentially different formats
        const coords = extractCoordinates(file.location);
        
        if (!coords) {
          console.warn('Invalid audio file data:', file);
          return;
        }
        
        // Validate extracted coordinates
        if (!isValidCoordinate(coords.latitude, coords.longitude)) {
          console.warn('Invalid coordinates in audio file:', file);
          return;
        }
        
        const hiddenUntil = new Date(file.hidden_until);
        const isAvailable = now >= hiddenUntil;
        
        const note: VoiceNote = {
          id: file._id,
          latitude: coords.latitude,
          longitude: coords.longitude,
          title: file.title ||"Untitled Note",
          file_name: file.file_name,// Use title if available, fallback to file_name
          audioUrl: `${API_URL}/audio/files/${file._id}/download`,
          isDiscovered: false, // Reset discovery status on refresh
          hiddenUntil: file.hidden_until,
          range: file.range
        };
        
        if (isAvailable) {
          availableNotes.push(note);
        } else {
          hiddenNotesList.push(note);
        }
      });
      
      console.log(`Refreshed data: ${data.audio_files.length} files, ${availableNotes.length} available, ${hiddenNotesList.length} hidden`);
      
      // Update state with ONLY the newly fetched notes
      setVoiceNotes(availableNotes);
      setHiddenNotes(hiddenNotesList);
      
      // Save the updated notes to AsyncStorage (replacing previous data)
      await AsyncStorage.setItem('savedNotes', JSON.stringify(availableNotes));
      
    } catch (error) {
      console.error('Error refreshing audio files:', error);
      // Show error to user
      Alert.alert('Refresh Failed', 'Unable to refresh audio files. Please try again.');
    }
  };

  // New function to group nearby markers
  const updateGroupedMarkers = () => {
    if (voiceNotes.length === 0) return;

    const groups: { [key: string]: VoiceNote[] } = {};
    const processed = new Set<string>();

    // For each note, find all notes within the GROUP_THRESHOLD
    voiceNotes.forEach(note => {
      if (processed.has(note.id)) return;
      
      const groupKey = `group-${note.id}`;
      groups[groupKey] = [note];
      processed.add(note.id);
      
      // Find nearby notes
      voiceNotes.forEach(otherNote => {
        if (note.id === otherNote.id || processed.has(otherNote.id)) return;
        
        const distance = calculateDistance(
          note.latitude,
          note.longitude,
          otherNote.latitude,
          otherNote.longitude
        );
        
        if (distance <= GROUP_THRESHOLD) {
          groups[groupKey].push(otherNote);
          processed.add(otherNote.id);
        }
      });
    });
    
    // Convert groups to markers
    const markers: GroupedMarker[] = Object.entries(groups).map(([id, notes]) => {
      // If single note, use its location
      if (notes.length === 1) {
        return {
          id,
          latitude: notes[0].latitude,
          longitude: notes[0].longitude,
          notes
        };
      }
      
      // Otherwise, calculate average position for the group
      const latSum = notes.reduce((sum, note) => sum + note.latitude, 0);
      const lngSum = notes.reduce((sum, note) => sum + note.longitude, 0);
      
      return {
        id,
        latitude: latSum / notes.length,
        longitude: lngSum / notes.length,
        notes
      };
    });
    
    setGroupedMarkers(markers);
  };

  const checkHiddenNotes = () => {
    const now = new Date();
    const newlyAvailable: VoiceNote[] = [];
    const stillHidden: VoiceNote[] = [];
    
    hiddenNotes.forEach(note => {
      if (note.hiddenUntil) {
        const hiddenUntil = new Date(note.hiddenUntil);
        if (now >= hiddenUntil) {
          newlyAvailable.push(note);
        } else {
          stillHidden.push(note);
        }
      }
    });
    
    if (newlyAvailable.length > 0) {
      setVoiceNotes(prev => {
        // Create a map of existing notes to ensure uniqueness
        const notesMap = new Map(prev.map(note => [note.id, note]));
        
        // Add newly available notes
        newlyAvailable.forEach(note => {
          notesMap.set(note.id, note);
        });
        
        return Array.from(notesMap.values());
      });
      
      setHiddenNotes(stillHidden);
      console.log(`${newlyAvailable.length} notes are now available`);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) {
      console.warn('Invalid coordinates in distance calculation');
      return Infinity; // Return a large value to indicate invalid
    }
    
    const R = 6371e3;
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const playAudio = async (audioSource: string) => {
    try {
      // If already playing, pause
      if (isPlaying && soundRef.current) {
        await soundRef.current.pauseAsync();
        setIsPlaying(false);
        return;
      }

      // If sound is already loaded but paused, resume
      if (soundRef.current) {
        await soundRef.current.playAsync();
        setIsPlaying(true);
        return;
      }

      console.log('Playing audio from:', audioSource);
      
      // Get the access token for authorization
      const API_TOKEN = await AsyncStorage.getItem('accessToken');
      
      if (!API_TOKEN) {
        throw new Error('No access token found for audio playback');
      }
      
      // Create the audio source with authorization header
      const source = {
        uri: audioSource,
        headers: {
          'Authorization': `Bearer ${API_TOKEN}`
        }
      };
      
      // Create and load the sound
      const { sound } = await Audio.Sound.createAsync(source);
      soundRef.current = sound;
      
      // Start playing
      await sound.playAsync();
      setIsPlaying(true);
      
      // Set up a status update listener
      sound.setOnPlaybackStatusUpdate(async (status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          setIsPlaying(false);
          await sound.unloadAsync();
          soundRef.current = null;
        }
      });
    } catch (error) {
      console.error('Error playing audio:', error);
      setIsPlaying(false);
    }
  };

  const handleMarkerPress = (marker: GroupedMarker) => {
    if (!location) return;
    
    if (marker.notes.length === 1) {
      // Single note - handle like before
      handleSingleNoteSelection(marker.notes[0]);
    } else {
      // Multiple notes - show selection list
      setSelectedGroupNotes(marker.notes);
      setShowNotesList(true);
    }
  };

  const handleSingleNoteSelection = async (note: VoiceNote) => {
    if (!location || !isValidCoordinate(note.latitude, note.longitude)) {
      console.error('Invalid note coordinates or location:', note);
      return;
    }

    // Set the selected note
    setSelectedNote(note);

    const distance = calculateDistance(
      location.coords.latitude,
      location.coords.longitude,
      note.latitude,
      note.longitude
    );

    // Use note's range if available, otherwise use default threshold
    const threshold = note.range || LOCATION_THRESHOLD;

    // Mark as discovered if within range (but don't play automatically)
    if (distance <= threshold && !note.isDiscovered) {
      const updatedNotes = voiceNotes.map(n => 
        n.id === note.id ? { ...n, isDiscovered: true } : n
      );
      setVoiceNotes(updatedNotes);
      await AsyncStorage.setItem('savedNotes', JSON.stringify(updatedNotes));
    }
  };

  const handlePlayButtonPress = () => {
    if (!selectedNote || !selectedNote.audioUrl) return;
    
    if (!location) {
      Alert.alert('Location Error', 'Unable to determine your location.');
      return;
    }
    
    const distance = calculateDistance(
      location.coords.latitude,
      location.coords.longitude,
      selectedNote.latitude,
      selectedNote.longitude
    );
    
    // Use note's range if available, otherwise use default threshold
    const threshold = selectedNote.range || LOCATION_THRESHOLD;
    
    // Only play if within range
    if (distance <= threshold) {
      playAudio(selectedNote.audioUrl);
    } else {
      Alert.alert('Out of Range', 'You must be closer to this note to play it.');
    }
  };

  const handleAddNote = () => {
    router.push('/record');
  };

  const handleRefresh = () => {
    loadMapData();
  };

  const handleCloseNotesList = () => {
    setShowNotesList(false);
    setSelectedGroupNotes([]);
  };

  const getRemainingTime = (hiddenUntil: string) => {
    const now = new Date();
    const unlockTime = new Date(hiddenUntil);
    const diff = unlockTime.getTime() - now.getTime();
    
    if (diff <= 0) return 'Available now';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) {
      return `${hours}h ${minutes}m remaining`;
    } else {
      return `${minutes}m remaining`;
    }
  };

  // Item renderer for the note selection list
  const renderNoteItem = ({ item }: { item: VoiceNote }) => {
    if (!location) return null;
    
    const distance = calculateDistance(
      location.coords.latitude,
      location.coords.longitude,
      item.latitude,
      item.longitude
    );
    
    const isLocked = item.hiddenUntil && new Date() < new Date(item.hiddenUntil);
    
    return (
      <TouchableOpacity 
        style={styles.noteListItem}
        onPress={() => {
          handleSingleNoteSelection(item);
          setShowNotesList(false);
        }}
        disabled={Boolean(isLocked)}>
        <View style={styles.noteListItemContent}>
          <View>
            <Text style={styles.noteListItemTitle}>{item.title}</Text>
            {isLocked ? (
              <Text style={styles.lockedText}>{getRemainingTime(item.hiddenUntil!)}</Text>
            ) : (
              <Text style={styles.noteListItemDistance}>{Math.round(distance)} meters away</Text>
            )}
          </View>
          <ChevronRight size={16} color="#888" />
        </View>
      </TouchableOpacity>
    );
  };

  // Helper to render markers as components for MapLibre
  const renderMarkers = () => {
    const markers = [];
    
    // User location marker
    if (location && isValidCoordinate(location.coords.latitude, location.coords.longitude)) {
      markers.push(
        <MapLibreGL.PointAnnotation
          key="user-location"
          id="user-location"
          coordinate={[location.coords.longitude, location.coords.latitude]}
        >
          <View style={styles.blueDot} />
        </MapLibreGL.PointAnnotation>
      );
    }
    
    // Grouped markers
    groupedMarkers.forEach((marker) => {
      if (!isValidCoordinate(marker.latitude, marker.longitude)) {
        return null;
      }
      
      const hasMultipleNotes = marker.notes.length > 1;
      const allDiscovered = hasMultipleNotes && 
        marker.notes.every(note => note.isDiscovered);
      const someDiscovered = hasMultipleNotes && 
        marker.notes.some(note => note.isDiscovered);
      
      // Marker content based on type
      let markerContent;
      if (!hasMultipleNotes) {
        const note = marker.notes[0];
        markerContent = (
          <View style={[styles.marker, note.isDiscovered && styles.markerDiscovered]}>
            <MapPin size={20} color={note.isDiscovered ? '#00ff9d' : '#fff'} />
          </View>
        );
      } else {
        markerContent = (
          <View style={[
            styles.markerGroup, 
            allDiscovered && styles.markerGroupAllDiscovered,
            someDiscovered && !allDiscovered && styles.markerGroupSomeDiscovered
          ]}>
            <Text style={styles.markerGroupText}>{marker.notes.length}</Text>
          </View>
        );
      }
      
      markers.push(
        <MapLibreGL.PointAnnotation
          key={`marker-${marker.id}`}
          id={`marker-${marker.id}`}
          coordinate={[marker.longitude, marker.latitude]}
          onSelected={() => handleMarkerPress(marker)}
        >
          {markerContent}
        </MapLibreGL.PointAnnotation>
      );
    });
    
    // Hidden note markers
    hiddenNotes.forEach((note, index) => {
      if (!isValidCoordinate(note.latitude, note.longitude)) {
        return;
      }
      
      markers.push(
        <MapLibreGL.PointAnnotation
          key={`hidden-${note.id}-${index}`}
          id={`hidden-${note.id}-${index}`}
          coordinate={[note.longitude, note.latitude]}
          onSelected={() => setSelectedNote(note)}
        >
          <View style={styles.markerHidden}>
            <Clock size={20} color="#888" />
          </View>
        </MapLibreGL.PointAnnotation>
      );
    });
    
    return markers;
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#00ff9d" style={styles.loading} />
      ) : location ? (
        <MapLibreGL.MapView
          ref={mapRef}
          style={styles.map}
          mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
          logoEnabled={false}
          compassEnabled={false}
          attributionEnabled={true}
          zoomEnabled={true}
          // maxZoomLevel={18} 
        >
          <MapLibreGL.Camera
            ref={cameraRef}
            defaultSettings={{
              centerCoordinate: [location.coords.longitude, location.coords.latitude],
              zoomLevel: 14
            }}
            followUserLocation={true}
          />
          
          {/* Use user location from the MapLibreGL component */}
          <MapLibreGL.UserLocation visible={true} />
          
          {/* Render all markers */}
          {renderMarkers()}
        </MapLibreGL.MapView>
      ) : (
        <Text style={styles.errorText}>Location permission denied or not available.</Text>
      )}

      {/* Multiple notes selection list */}
      {showNotesList && (
        <View style={styles.notesList}>
          <View style={styles.notesListHeader}>
            <Text style={styles.notesListTitle}>Select Audio</Text>
            <TouchableOpacity onPress={handleCloseNotesList}>
              <X size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          <FlatList
            data={selectedGroupNotes}
            renderItem={renderNoteItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.notesListContent}
          />
        </View>
      )}

      {selectedNote && !showNotesList && (
        <View style={styles.noteInfo}>
          <View style={styles.noteInfoHeader}>
            <View>
              <Text style={styles.noteTitle}>{selectedNote.title}</Text>
              
              {selectedNote.hiddenUntil && new Date() < new Date(selectedNote.hiddenUntil) ? (
                <View style={styles.lockedNote}>
                  <Clock size={16} color="#ff4d4d" style={styles.lockIcon} />
                  <Text style={styles.lockedText}>
                    {getRemainingTime(selectedNote.hiddenUntil)}
                  </Text>
                </View>
              ) : (
                <Text style={styles.noteDistance}>
                  {location && isValidCoordinate(location.coords.latitude, location.coords.longitude) &&
                   isValidCoordinate(selectedNote.latitude, selectedNote.longitude)
                    ? `${Math.round(
                        calculateDistance(
                          location.coords.latitude,
                          location.coords.longitude,
                          selectedNote.latitude,
                          selectedNote.longitude
                        )
                      )} meters away`
                    : 'Calculating distance...'}
                </Text>
              )}
              
              <Text style={styles.noteDistance}>
                {location && isValidCoordinate(location.coords.latitude, location.coords.longitude) &&
                 isValidCoordinate(selectedNote.latitude, selectedNote.longitude)
                  ? `${selectedNote.range} meter range`
                  : 'Calculating range...'}
              </Text>
            </View>
            
            {/* Play button only shown for notes that aren't hidden */}
            {!(selectedNote.hiddenUntil && new Date() < new Date(selectedNote.hiddenUntil)) && (
              <TouchableOpacity 
                style={[styles.playButton, isPlaying && styles.pauseButton]} 
                onPress={handlePlayButtonPress}
              >
                {isPlaying ? (
                  <Pause size={24} color="#fff" />
                ) : (
                  <Play size={24} color="#fff" />
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <View style={styles.statsContainer}>
        <Text style={styles.statsText}>
          {voiceNotes.length} available • {hiddenNotes.length} upcoming
        </Text>
      </View>

      <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
        <RefreshCw size={24} color="#fff" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.addButton} onPress={handleAddNote}>
        <Plus size={24} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  map: { width: '100%', height: '100%' },
  marker: {
    backgroundColor: '#ff4d4d',
    padding: 8,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#fff',
  },
  markerGroup: {
    backgroundColor: '#ff4d4d',
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  markerGroupText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  markerGroupAllDiscovered: {
    backgroundColor: '#1a1a1a',
    borderColor: '#00ff9d',
  },
  markerGroupSomeDiscovered: {
    backgroundColor: '#ff4d4d',
    borderColor: '#00ff9d',
  },
  markerHidden: {
    backgroundColor: '#333',
    padding: 8,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#888',
    opacity: 0.7,
  },
  blueDot: {
    width: 14,
    height: 14,
    backgroundColor: '#0084ff',
    borderRadius: 7,
    borderWidth: 3,
    borderColor: '#add8e6',
  },
  markerDiscovered: { backgroundColor: '#1a1a1a' },
  noteInfo: { 
    position: 'absolute', 
    bottom: 20, 
    left: 20, 
    right: 20, 
    backgroundColor: 'rgba(26, 26, 26, 0.9)', 
    padding: 20, 
    borderRadius: 12, 
    borderWidth: 1, 
    borderColor: '#333' 
  },
  noteInfoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  noteTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  noteDistance: { fontSize: 14, color: '#888' },
  addButton: { position: 'absolute', bottom: 200, right: 20, backgroundColor: '#00ff9d', width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  refreshButton: { position: 'absolute', top: 50, right: 20, backgroundColor: '#ff4d4d', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#ff4d4d', textAlign: 'center', marginTop: 20 },
  lockedNote: { flexDirection: 'row', alignItems: 'center' },
  lockedText: { color: '#ff4d4d', fontSize: 14, marginLeft: 4 },
  lockIcon: { marginRight: 4 },
  playButton: {
    backgroundColor: '#00ff9d',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pauseButton: {
    backgroundColor: '#ff4d4d',
  },
  statsContainer: { 
    position: 'absolute', 
    top: 50, 
    left: 20, 
    backgroundColor: 'rgba(26, 26, 26, 0.7)', 
    paddingVertical: 6, 
    paddingHorizontal: 12, 
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#333'
  },
  statsText: { color: '#ccc', fontSize: 12 },
  // Styles for notes list
  notesList: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(26, 26, 26, 0.9)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: '#333',
    maxHeight: '60%',
  },
  notesListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  notesListTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  notesListContent: {
    paddingBottom: 20,
  },
  noteListItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  noteListItemContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  noteListItemTitle: {
    fontSize: 16,
    color: '#fff',
    marginBottom: 4,
  },
  noteListItemDistance: {
    fontSize: 12,
    color: '#888',
  },
});