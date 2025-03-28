import { useEffect, useState, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { Marker, UrlTile } from 'react-native-maps';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { MapPin, Plus, RefreshCw } from 'lucide-react-native';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface VoiceNote {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  audioUrl: string;
  isDiscovered: boolean;
}

const LOCATION_THRESHOLD = 50; // meters
const OSM_TILE_URL = "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png"; // OpenStreetMap tile server

export default function MapScreen() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<VoiceNote | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const soundRef = useRef<Audio.Sound | null>(null);
  const router = useRouter();

  useEffect(() => {
    loadMapData();
    return () => {
      if (soundRef.current) {
        soundRef.current.unloadAsync();
      }
    };
  }, []);

  const loadMapData = async () => {
    setLoading(true);
    await loadVoiceNotes();

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.warn('Location permission not granted');
      setLoading(false);
      return;
    }

    const currentLocation = await Location.getCurrentPositionAsync({});
    setLocation(currentLocation);
    setLoading(false);
  };

  const loadVoiceNotes = async () => {
    try {
      const savedNotes = await AsyncStorage.getItem('savedNotes');
      if (savedNotes) {
        setVoiceNotes(JSON.parse(savedNotes));
      }
    } catch (error) {
      console.error('Failed to load voice notes:', error);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
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

  const handleMarkerPress = async (note: VoiceNote) => {
    if (!location) return;

    const audioSource = note.audioUrl;
    if (!audioSource) {
      console.error('Error: Audio source is missing for this note', note);
      return;
    }

    const distance = calculateDistance(
      location.coords.latitude,
      location.coords.longitude,
      note.latitude,
      note.longitude
    );

    if (distance > LOCATION_THRESHOLD) {
      setSelectedNote(note);
      return;
    }

    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
      }

      console.log('Playing audio from:', audioSource);
      const { sound } = await Audio.Sound.createAsync({ uri: audioSource });
      soundRef.current = sound;
      await sound.playAsync();
      setIsPlaying(true);
      setSelectedNote(note);

      sound.setOnPlaybackStatusUpdate(async (status) => {
        if (!status.isLoaded) return;
        if (status.didJustFinish) {
          setIsPlaying(false);
          await sound.unloadAsync();
        }
      });

    } catch (error) {
      console.error('Error playing audio:', error);
    }
  };

  const handleAddNote = () => {
    router.push('/record');
  };

  const handleRefresh = () => {
    loadMapData();
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#00ff9d" style={styles.loading} />
      ) : location ? (
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
        >
          <UrlTile urlTemplate={OSM_TILE_URL} maximumZ={19} flipY={false} />

          <Marker coordinate={{ latitude: location.coords.latitude, longitude: location.coords.longitude }} title="You are here">
            <View style={styles.blueDot} />
          </Marker>

          {voiceNotes.map((note, index) => (
            <Marker
              key={note.id || `marker-${index}`}
              coordinate={{
                latitude: note.latitude,
                longitude: note.longitude,
              }}
              onPress={() => handleMarkerPress(note)}>
              <View style={[styles.marker, note.isDiscovered && styles.markerDiscovered]}>
                <MapPin size={20} color={note.isDiscovered ? '#00ff9d' : '#fff'} />
              </View>
            </Marker>
          ))}
        </MapView>
      ) : (
        <Text style={styles.errorText}>Location permission denied or not available.</Text>
      )}

      {selectedNote && (
        <View style={styles.noteInfo}>
          <Text style={styles.noteTitle}>{selectedNote.title}</Text>
          <Text style={styles.noteDistance}>
            {location
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
        </View>
      )}

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
  blueDot: {
    width: 14,
    height: 14,
    backgroundColor: '#0084ff',
    borderRadius: 7,
    borderWidth: 3,
    borderColor: '#add8e6',
  },
  markerDiscovered: { backgroundColor: '#1a1a1a' },
  noteInfo: { position: 'absolute', bottom: 20, left: 20, right: 20, backgroundColor: 'rgba(26, 26, 26, 0.9)', padding: 20, borderRadius: 12, borderWidth: 1, borderColor: '#333' },
  noteTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  noteDistance: { fontSize: 14, color: '#888' },
  addButton: { position: 'absolute', bottom: 100, right: 20, backgroundColor: '#00ff9d', width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  refreshButton: { position: 'absolute', top: 50, right: 20, backgroundColor: '#ff4d4d', width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: '#ff4d4d', textAlign: 'center', marginTop: 20 },
});
