import { useState, useEffect } from "react";
import { View, Text, StyleSheet, Alert, Button } from "react-native";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as TaskManager from "expo-task-manager";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const LOCATION_THRESHOLD = 0.0005; // ~50m range
const LOCATION_TRACKING_TASK = "background-location-task";

// Define TypeScript Interface for Voice Notes
interface VoiceNote {
  id: string;
  title: string;
  location: {
    latitude: number;
    longitude: number;
  };
}

// ✅ Send Notification Function
const sendNotification = async (noteTitle: string) => {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "📍 You found a buried audio!",
      body: `Your voice note "${noteTitle}" is nearby. Play it now!`,
    },
    trigger: null,
  });
};

// ✅ Background Location Task
TaskManager.defineTask(LOCATION_TRACKING_TASK, async ({ data, error }) => {
  if (error) {
    console.error("Background location task error:", error);
    return;
  }

  if (data && "locations" in data) {
    const { locations } = data as { locations: { coords: { latitude: number; longitude: number } }[] };
    const { latitude, longitude } = locations[0].coords;
    console.log(`📍 Background Location: ${latitude}, ${longitude}`);

    // Load stored locations from AsyncStorage
    const storedNotes = await AsyncStorage.getItem("voiceNotes");
    if (storedNotes) {
      const notes: VoiceNote[] = JSON.parse(storedNotes);

      // Check if user is near any stored audio location
      notes.forEach((note) => {
        const distance =
          Math.abs(note.location.latitude - latitude) +
          Math.abs(note.location.longitude - longitude);
        if (distance < LOCATION_THRESHOLD) {
          sendNotification(note.title);
        }
      });
    }
  }
});

// ✅ Location Tracker Component
export default function LocationTracker() {
  const [currentLocation, setCurrentLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [notes, setNotes] = useState<VoiceNote[]>([]);

  useEffect(() => {
    requestPermissions();
    loadStoredLocations().then(startTracking);
  }, []);

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
    const storedNotes = await AsyncStorage.getItem("voiceNotes");
    if (storedNotes) {
      const parsedNotes: VoiceNote[] = JSON.parse(storedNotes);
      console.log("Stored Notes:", parsedNotes);
      setNotes(parsedNotes);
    }
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

  // ✅ Test Notification
  useEffect(() => {
    Notifications.scheduleNotificationAsync({
      content: {
        title: "Test Notification",
        body: "If you see this, notifications are working!",
      },
      trigger: null,
    });
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.text}>Tracking location...</Text>
      {currentLocation && (
        <Text style={styles.text}>
          Current: {currentLocation.latitude.toFixed(5)}, {currentLocation.longitude.toFixed(5)}
        </Text>
      )}
      <Button title="Test Notification" onPress={() => sendNotification("Test Voice Note")} />
    </View>
  );
}

// ✅ Styles
const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a1a1a",
  },
  text: {
    color: "#fff",
    fontSize: 16,
  },
});
