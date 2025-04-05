import { useState, useEffect } from "react";
import { View, Text, StyleSheet, Alert, Button, TouchableOpacity } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as TaskManager from "expo-task-manager";
import { Audio } from "expo-av";
import { useNavigation, useRoute } from "@react-navigation/native";

// Define notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true, 
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const LOCATION_THRESHOLD = 0.1000; // Default threshold if range is not provided
const LOCATION_TRACKING_TASK = "background-location-task";
const API_BASE_URL = "https://echo-trails-backend.vercel.app"; // Add your API base URL here
const NOTIFIED_NOTES_KEY = "notifiedNotes"; // Key for storing notified notes in AsyncStorage

// Define TypeScript Interface for Voice Notes
interface Note {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  range: number; // Optional range field from your AsyncStorage data
  hidden_until?: string; // Optional timestamp from your AsyncStorage data
}

// Interface for route params
interface RouteParams {
  noteId?: string;
}

// ✅ Send Notification Function with data payload - now with tracking
const sendNotification = async (note: Note) => {
  try {
    // Check if we've already notified the user about this note
    const notifiedNotesStr = await AsyncStorage.getItem(NOTIFIED_NOTES_KEY);
    const notifiedNotes = notifiedNotesStr ? JSON.parse(notifiedNotesStr) : {};
    
    // If this note has already been notified, don't send another notification
    if (notifiedNotes[note.id]) {
      console.log(`Already notified for note: ${note.title}, skipping notification`);
      return;
    }
    
    console.log(`Sending notification for note: ${note.title}`);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "📍 You found a buried audio!",
        body: `Your voice note "${note.title}" is nearby. Play it now!`,
        data: { noteId: note.id }, // Pass the note ID in the notification data
      },
      trigger: null,
    });
    
    // Mark this note as notified
    notifiedNotes[note.id] = true;
    await AsyncStorage.setItem(NOTIFIED_NOTES_KEY, JSON.stringify(notifiedNotes));
    
  } catch (error) {
    console.error("Error sending notification:", error);
  }
};

// ✅ Helper function to calculate distance between two points
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  // Using Haversine formula for more accurate distance calculation
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in meters
};

// ✅ Background Location Task
TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
  if (error) {
    console.error("Background location task error:", error);
    return;
  }

  if (data && typeof data === "object" && "locations" in data) {
    const { locations } = data as { locations: { coords: { latitude: number; longitude: number } }[] };
    const { latitude, longitude } = locations[0].coords;
    console.log(`📍 Background Location: ${latitude}, ${longitude}`);

    // Load stored locations from AsyncStorage
    const storedNotes = await AsyncStorage.getItem("savedNotes");
    if (storedNotes) {
      const notes: Note[] = JSON.parse(storedNotes);

      // Check if user is near any stored audio location
      notes.forEach((note) => {
        // Calculate actual distance in meters
        const distanceInMeters = calculateDistance(latitude, longitude, note.latitude, note.longitude);
        
        // Use the note's range value if available, otherwise use default threshold
        const rangeInMeters = note.range || (LOCATION_THRESHOLD * 111000); // Convert degrees to approx meters
        
        console.log(`Note "${note.title}": Distance=${distanceInMeters}m, Range=${rangeInMeters}m`);
        
        // Only send notification if note is not hidden or if hidden_until date has passed
        const isHidden = note.hidden_until && new Date(note.hidden_until) > new Date();
        
        if (distanceInMeters < rangeInMeters && !isHidden) {
          console.log(`📢 Within range for note "${note.title}". Checking if already notified...`);
          sendNotification(note);
        }
      });
    }
  }
});

// ✅ Location Tracker Component
export default function LocationTracker() {
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [currentAudio, setCurrentAudio] = useState<Note | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAudioLoaded, setIsAudioLoaded] = useState(false);
  
  const navigation = useNavigation();
  const route = useRoute();
  const params = route.params as RouteParams | undefined;
  
  // Set up notification response handler
  useEffect(() => {
    // This sets up the handler for when a user taps on a notification
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      const noteId = data && typeof data === 'object' && 'noteId' in data ? data.noteId as string : undefined;
      
      if (noteId) {
        console.log(`Notification tapped for note ID: ${noteId}`);
        loadAudioDetailsForNote(noteId);
      }
    });
    
    // Check if we were opened from a notification (app was closed)
    const checkInitialNotification = async () => {
      const lastNotificationResponse = await Notifications.getLastNotificationResponseAsync();
      if (lastNotificationResponse) {
        const data = lastNotificationResponse.notification.request.content.data;
        const noteId = data && typeof data === 'object' && 'noteId' in data ? data.noteId as string : undefined;
        
        if (noteId) {
          loadAudioDetailsForNote(noteId);
        }
      }
    };
    
    checkInitialNotification();
    
    // Check if noteId was passed via navigation params
    if (params && params.noteId) {
      loadAudioDetailsForNote(params.noteId);
    }
    
    return () => {
      subscription.remove();
      // Clean up any playing audio
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, []);

  useEffect(() => {
    requestPermissions();
    loadStoredLocations().then(startTracking);
    
    // Set up foreground location tracking
    let foregroundSubscription: Location.LocationSubscription | null = null;
    
    const startForegroundTracking = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      
      foregroundSubscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 10,
        },
        (location) => {
          setCurrentLocation(location.coords);
          // Also check for nearby audio notes in foreground
          checkNearbyAudios(location.coords);
        }
      );
    };
    
    startForegroundTracking();
    
    return () => {
      if (foregroundSubscription) {
        foregroundSubscription.remove();
      }
    };
  }, []);

  // ✅ Check for nearby audio in foreground
  const checkNearbyAudios = async (coords: { latitude: number; longitude: number }) => {
    if (!notes || notes.length === 0) return;
    
    notes.forEach((note) => {
      const distanceInMeters = calculateDistance(
        coords.latitude, 
        coords.longitude, 
        note.latitude, 
        note.longitude
      );
      
      // Use the note's range value if available, otherwise use default threshold
      const rangeInMeters = note.range || (LOCATION_THRESHOLD * 111000);
      
      // Only send notification if note is not hidden or if hidden_until date has passed
      const isHidden = note.hidden_until && new Date(note.hidden_until) > new Date();
      
      if (distanceInMeters < rangeInMeters && !isHidden) {
        console.log(`📱 Foreground: Within range for note "${note.title}"`);
        sendNotification(note);
      }
    });
  };

  // ✅ Request Location & Notification Permissions
  const requestPermissions = async () => {
    const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
    if (locationStatus !== "granted") {
      Alert.alert("Permission denied", "Location permission is required.");
    }

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== "granted") {
      Alert.alert("Permission denied", "Background location permission is required.");
    }

    const { status: notificationStatus } = await Notifications.requestPermissionsAsync();
    if (notificationStatus !== "granted") {
      Alert.alert("Permission denied", "Notification permission is required.");
    } else {
      console.log("✅ Notification permission granted.");
    }
  };

  // ✅ Load Stored Locations
  const loadStoredLocations = async () => {
    const storedNotes = await AsyncStorage.getItem("savedNotes");
    if (storedNotes) {
      const parsedNotes: Note[] = JSON.parse(storedNotes);
      console.log("Stored Notes:", parsedNotes);
      setNotes(parsedNotes);
      return parsedNotes;
    }
    return [];
  };

  // ✅ Start Background Tracking
  const startTracking = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission denied", "Location tracking requires permission.");
      return;
    }

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    if (bgStatus !== "granted") {
      Alert.alert("Permission denied", "Enable background location tracking.");
      return;
    }

    await Location.startLocationUpdatesAsync(LOCATION_TRACKING_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000, // Check every 5 sec
      distanceInterval: 10, // Check every 10 meters
      showsBackgroundLocationIndicator: true, // iOS indicator
    });

    console.log("✅ Background location tracking started.");
  };

  // Load audio details without playing
  const loadAudioDetailsForNote = async (noteId: string) => {
    try {
      const API_TOKEN = await AsyncStorage.getItem('accessToken');
      
      if (!API_TOKEN) {
        console.error("No access token found in AsyncStorage");
        throw new Error('No access token found');
      }
      console.log(`Loading audio details for note ID: ${noteId}`);
      
      // Check if the note exists in local storage first
      const storedNotes = await AsyncStorage.getItem("savedNotes");
      if (storedNotes) {
        const parsedNotes: Note[] = JSON.parse(storedNotes);
        const localNote = parsedNotes.find(note => note.id === noteId);
        
        if (localNote) {
          console.log("Found note in local storage:", localNote);
          setCurrentAudio(localNote);
          // Don't play automatically - just prepare the audio
          prepareAudio(noteId);
          return;
        }
      }
      
      // If not found locally, fetch from API
      console.log(`Fetching note data from API: ${API_BASE_URL}/audio/files/${noteId}`);
      const response = await fetch(`${API_BASE_URL}/audio/files/${noteId}`, {
        headers: {
          'Authorization': `Bearer ${API_TOKEN}` 
        }
      });
      
      if (!response.ok) {
        console.error(`API error: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to fetch audio metadata: ${response.status}`);
      }
      
      const audioData = await response.json();
      console.log("Audio metadata received:", audioData);
      
      // Create a note object from the API response
      const audioNote: Note = {
        id: audioData._id,
        title: audioData.title,
        latitude: audioData.location.coordinates[1], // Note: API uses [lng, lat]
        longitude: audioData.location.coordinates[0],
        range: audioData.range,
        hidden_until: audioData.hidden_until
      };
      
      setCurrentAudio(audioNote);
      // Don't play automatically - just prepare the audio
      prepareAudio(audioNote.id);
    } catch (error) {
      console.error("Error loading audio details:", error);
      Alert.alert("Error", "Failed to load the audio file. Please check your network connection and try again.");
    }
  };

  // Prepare audio for playing (but don't play yet)
  const prepareAudio = async (noteId: string) => {
    try {
      // Unload any existing audio
      const API_TOKEN = await AsyncStorage.getItem('accessToken');
      
      if (!API_TOKEN) {
        console.error("No access token found for audio playback");
        throw new Error('No access token found');
      }
      
      if (sound) {
        await sound.unloadAsync();
        setSound(null);
        setIsPlaying(false);
      }
      
      console.log(`Preparing audio for note ID: ${noteId}`);
      
      // Get the download URL with full URL
      const audioUri = `${API_BASE_URL}/audio/files/${noteId}/download`;
      console.log(`Attempting to load audio from: ${audioUri}`);
      
      // Create a request to download the audio file
      const soundObject = new Audio.Sound();
      
      // Load the sound with proper headers but don't play yet
      await soundObject.loadAsync(
        { 
          uri: audioUri,
          headers: {
            'Authorization': `Bearer ${API_TOKEN}`
          }
        },
        { shouldPlay: false } // Don't play automatically
      );
      
      console.log("Audio loaded successfully and ready to play");
      setSound(soundObject);
      setIsAudioLoaded(true);
      
      // Listen for playback status updates
      soundObject.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          if (status.didJustFinish) {
            console.log("Audio playback finished");
            setIsPlaying(false);
          }
        } else if (status.error) {
          console.error(`Audio playback error: ${status.error}`);
          Alert.alert("Playback Error", "There was an error playing this audio.");
        }
      });
    } catch (error) {
      console.error("Error preparing audio:", error);
      Alert.alert("Error", "Failed to prepare the audio file. Please check your network connection and try again.");
    }
  };
  
  // ✅ Toggle play/pause
  const togglePlayback = async () => {
    if (!sound) {
      if (currentAudio) {
        // If we have details but audio isn't loaded yet, prepare it first
        await prepareAudio(currentAudio.id);
        await sound?.playAsync();
        setIsPlaying(true);
      }
      return;
    }
    
    if (isPlaying) {
      await sound.pauseAsync();
      setIsPlaying(false);
    } else {
      await sound.playAsync();
      setIsPlaying(true);
    }
  };

  // ✅ Test notification with specific note - with reset option
  const testNotification = async () => {
    if (notes.length > 0) {
      console.log("Testing notification with note:", notes[0]);
      
      // First, remove this note from the "already notified" list to test
      const notifiedNotesStr = await AsyncStorage.getItem(NOTIFIED_NOTES_KEY);
      const notifiedNotes = notifiedNotesStr ? JSON.parse(notifiedNotesStr) : {};
      
      if (notifiedNotes[notes[0].id]) {
        delete notifiedNotes[notes[0].id]; // Remove from notified list to allow test
        await AsyncStorage.setItem(NOTIFIED_NOTES_KEY, JSON.stringify(notifiedNotes));
      }
      
      sendNotification(notes[0]);
    } else {
      Alert.alert("No Notes", "No notes available to test notification.");
    }
  };
  
  // ✅ Reset notification history
  const resetNotificationHistory = async () => {
    await AsyncStorage.removeItem(NOTIFIED_NOTES_KEY);
    Alert.alert("Reset Complete", "Notification history has been reset. You will receive notifications for all notes again.");
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Location Audio Player</Text>
      
      {currentLocation && (
        <View style={styles.locationContainer}>
          <Text style={styles.text}>Current Location:</Text>
          <Text style={styles.coordsText}>
            {currentLocation.latitude.toFixed(5)}, {currentLocation.longitude.toFixed(5)}
          </Text>
        </View>
      )}
      
      {currentAudio ? (
        <View style={styles.audioContainer}>
          <Text style={styles.audioTitle}>{currentAudio.title}</Text>
          
          <TouchableOpacity 
            style={styles.playButton} 
            onPress={togglePlayback}
          >
            <Text style={styles.playButtonText}>
              {isPlaying ? "Pause" : "Play"}
            </Text>
          </TouchableOpacity>
          
          <Text style={styles.audioLocation}>
            📍 Located at: {currentAudio.latitude.toFixed(5)}, {currentAudio.longitude.toFixed(5)}
          </Text>
          {currentAudio.range && (
            <Text style={styles.audioRange}>
              Range: {currentAudio.range} meters
            </Text>
          )}
        </View>
      ) : (
        <View style={styles.messageContainer}>
          <Text style={styles.message}>
            Walk around to discover audio notes nearby!
          </Text>
        </View>
      )}
      
      <View style={styles.buttonContainer}>
        <Button 
          title="Test Notification" 
          onPress={testNotification} 
        />
        <View style={styles.buttonSpacer} />
        <Button 
          title="Reset Notification History" 
          onPress={resetNotificationHistory}
          color="#ff6347" 
        />
      </View>
    </View>
  );
}

// ✅ Enhanced Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
    padding: 20,
  },
  title: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  text: {
    color: "#fff",
    fontSize: 16,
    marginBottom: 5,
  },
  coordsText: {
    color: "#aaf",
    fontSize: 16,
    marginBottom: 20,
  },
  locationContainer: {
    alignItems: "center",
    marginBottom: 30,
  },
  audioContainer: {
    backgroundColor: "#333",
    borderRadius: 10,
    padding: 20,
    width: "100%",
    alignItems: "center",
    marginBottom: 20,
  },
  audioTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 15,
  },
  playButton: {
    backgroundColor: "#4CAF50",
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
    marginBottom: 15,
  },
  playButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "bold",
  },
  audioLocation: {
    color: "#bbb",
    fontSize: 14,
    marginBottom: 5,
  },
  audioRange: {
    color: "#bbb",
    fontSize: 14,
  },
  messageContainer: {
    backgroundColor: "#333",
    borderRadius: 10,
    padding: 20,
    width: "100%",
    alignItems: "center",
    marginBottom: 20,
  },
  message: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
  },
  buttonContainer: {
    marginTop: 20,
    width: "100%",
  },
  buttonSpacer: {
    height: 10,
  }
});