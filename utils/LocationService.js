import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { calculateDistance } from './distance'; // Import your distance calculation
import { sendProximityNotification } from './notification'; // Make sure to import this

// Use a consistent task name
export const BACKGROUND_LOCATION_TASK = 'background-location-task';

// Define the background location task
export const defineLocationTask = () => {
  // Only define if not already defined
  if (!TaskManager.isTaskDefined(BACKGROUND_LOCATION_TASK)) {
    TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
      console.log("BACKGROUND TASK TRIGGERED");

      if (error) {
        console.error("Background location task error:", error);
        return;
      }
      
      if (!data) {
        console.log("No data received in background location task");
        return;
      }
      
      // Extract location data
      const { locations } = data;
      const location = locations[0];
      
      if (!location) {
        console.log("No location data available");
        return;
      }
      
      const { latitude, longitude } = location.coords;
      console.log(`📍 Background Location: ${latitude}, ${longitude}`);
      
      try {
        // Get saved notes with location data
        const notesJson = await AsyncStorage.getItem('savedNotes');
        if (!notesJson) {
          console.log("No saved notes found");
          return;
        }
        
        const savedNotes = JSON.parse(notesJson);
        const triggeredNotes = [];
        const notesToKeep = [];
        
        // Check each note's distance against current location
        for (const note of savedNotes) {
          // Skip if already discovered - we'll remove these
          if (note.isDiscovered) {
            continue;
          }
          
          // Use note's specific range or default
          const proximityThreshold = note.range;
          
          const distance = calculateDistance(
            latitude, 
            longitude, 
            note.latitude, 
            note.longitude
          );
          console.log("savedNotes",notesJson)
          console.log(`Note "${note.title}": Distance=${distance}m, Threshold=${proximityThreshold}m`);
          
          // Check if within proximity threshold and also check time lock if applicable
          const isUnlocked = !note.hidden_until || new Date(note.hidden_until) <= new Date();
          
          // If user is within range of the note
          if (distance <= proximityThreshold && isUnlocked) {
            triggeredNotes.push({
              id: note.id,
              title: note.title,
              distance: Math.round(distance)
            });
            
            // Mark as discovered (we'll filter it out)
            note.isDiscovered = true;
          }
          
          // Only keep notes that haven't been discovered
          if (!note.isDiscovered) {
            notesToKeep.push(note);
          }
        }
        
        // If there are notes in range, store them for notification
        if (triggeredNotes.length > 0) {
          console.log('Triggered notes stored:', triggeredNotes.length);
          
          // Store triggered notes data for access when notification is tapped
          await AsyncStorage.setItem('triggeredNotes', JSON.stringify(triggeredNotes));
          
          // Update saved notes to REMOVE discovered ones
          await AsyncStorage.setItem('savedNotes', JSON.stringify(notesToKeep));
          
          // Store pending notification information
          await AsyncStorage.setItem('pendingNotifications', JSON.stringify({
            count: triggeredNotes.length,
            timestamp: new Date().toISOString()
          }));
          
          // Send notification immediately
          try {
            // Import at the top of your file or use a utility function
            await sendProximityNotification(triggeredNotes.length);
            console.log("Notification sent successfully");
          } catch (notifyError) {
            console.error("Failed to send notification:", notifyError);
          }
        }
      } catch (error) {
        console.error("Error processing location data:", error);
      }
    });
  }
};

// Force restart background tracking
export const restartBackgroundLocationTracking = async () => {
  try {
    // Stop any existing tracking
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
      .catch(() => false);
    
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      console.log("Stopped existing location tracking");
    }
    
    // Request permissions
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      console.log("Foreground location permission denied");
      return false;
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      console.log("Background location permission denied");
      return false;
    }
    
    // Define foreground service options for Android
    const foregroundService = {
      notificationTitle: "EchoSpot is using your location",
      notificationBody: "Looking for nearby voice notes",
      notificationColor: "#00ff9d",
    };

    // Start location updates with foreground service
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.High, // Increased accuracy
      timeInterval: 30000, // More frequent updates: 5 seconds
      distanceInterval: 2, // Smaller distance changes
      showsBackgroundLocationIndicator: true, // iOS indicator
      foregroundService, // Android foreground service
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.Fitness, // More aggressive tracking
    });
    
    console.log("Background location tracking RESTARTED successfully");
    await AsyncStorage.setItem('backgroundTrackingEnabled', 'true');
    return true;
  } catch (error) {
    console.error("Error restarting background location tracking:", error);
    if (error instanceof Error) {
      console.error(`Error name: ${error.name}, message: ${error.message}, stack: ${error.stack}`);
    }
    return false;
  }
};

// Start background location with consistent parameters
export const startBackgroundLocationTracking = async () => {
  try {
    console.log("Attempting to start background location tracking...");
    
    // Request permissions
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      console.log("Foreground location permission denied");
      return false;
    }

    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      console.log("Background location permission denied");
      return false;
    }

    // Check if the task is already running
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
      .catch(() => false);
    
    if (hasStarted) {
      console.log("Location updates already started - restarting for reliability");
      return await restartBackgroundLocationTracking();
    }
    
    // Define foreground service options for Android
    const foregroundService = {
      notificationTitle: "EchoSpot is using your location",
      notificationBody: "Looking for nearby voice notes",
      notificationColor: "#00ff9d",
    };

    // Start location updates with foreground service
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.High, // Increased accuracy
      timeInterval: 5000, // More frequent updates: 5 seconds
      distanceInterval: 2, // Smaller distance changes
      showsBackgroundLocationIndicator: true, // iOS indicator
      foregroundService, // Android foreground service
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.Fitness, // More aggressive tracking
    });
    
    console.log("Background location tracking started SUCCESSFULLY");
    await AsyncStorage.setItem('backgroundTrackingEnabled', 'true');
    return true;
  } catch (error) {
    console.error("Error starting background location tracking:", error);
    if (error instanceof Error) {
      console.error(`Error name: ${error.name}, message: ${error.message}, stack: ${error.stack}`);
    }
    return false;
  }
};

// Stop background location tracking
export const stopBackgroundLocationTracking = async () => {
  try {
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
      .catch(() => false);
    
    if (hasStarted) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      console.log("Background location tracking stopped");
    }
    
    await AsyncStorage.setItem('backgroundTrackingEnabled', 'false');
    return true;
  } catch (error) {
    console.error("Error stopping background location tracking:", error);
    return false;
  }
};

// Check if background tracking is enabled
export const isBackgroundLocationTrackingEnabled = async () => {
  try {
    const value = await AsyncStorage.getItem('backgroundTrackingEnabled');
    if (value === null) {
      return false;
    }
    
    // Double-check that the service is actually running
    if (value === 'true') {
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
        .catch(() => false);
      return hasStarted;
    }
    
    return false;
  } catch (error) {
    console.error("Error checking background tracking status:", error);
    return false;
  }
};