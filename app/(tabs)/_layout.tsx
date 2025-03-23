import { Tabs } from 'expo-router';
import { MapPin, Mic, User, Bell, Settings2 } from 'lucide-react-native';
import { useEffect } from 'react';
import { configureNotifications, addNotificationResponseListener } from '../../utils/notification';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { calculateDistance } from '../../utils/distance';
import { Ionicons } from '@expo/vector-icons';

// Define the background location task
const LOCATION_TASK_NAME = 'background-location-task';
const PROXIMITY_THRESHOLD = 100; // Distance in meters
type Note = {
  id: string;
  title: string;
  audioUrl: string;
  latitude: number;
  longitude: number;
  isDiscovered?: boolean;
  unlockTime?: string;
};
// Register the task before components are rendered
// Register the task before components are rendered
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("Location task error:", error);
    return;
  }
  
  if (data) {
    // Extract the location data
    const { locations } = data as { locations: Location.LocationObject[] };
    const currentLocation = locations[0];
    
    // Get stored voice notes from AsyncStorage
    try {
      const storedNotesJson = await AsyncStorage.getItem('savedNotes');
      if (storedNotesJson) {
        const storedNotes = JSON.parse(storedNotesJson) as Note[];
        
        // Check for nearby notes
        const nearbyNotes = storedNotes.filter((note: Note) => {
          if (note.isDiscovered) return false;
          
          const distance = calculateDistance(
            currentLocation.coords.latitude,
            currentLocation.coords.longitude,
            note.latitude,
            note.longitude
          );
          
          // Check if within proximity threshold and also check time lock if applicable
          const isUnlocked = !note.unlockTime || new Date(note.unlockTime) <= new Date();
          return distance <= PROXIMITY_THRESHOLD && isUnlocked;
        });
        
        // Send notifications for nearby notes
        if (nearbyNotes.length > 0) {
          await AsyncStorage.setItem('pendingNotifications', JSON.stringify({
            count: nearbyNotes.length,
            timestamp: new Date().toISOString()
          }));
        }
      }
    } catch (error) {
      console.error("Error checking nearby notes:", error);
    }
  }
});

// Start background location tracking
async function startLocationTracking(): Promise<boolean> {
  try {
    // Request foreground permissions first
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    if (foregroundStatus !== 'granted') {
      console.log('Permission to access location was denied');
      return false;
    }

    // Then request background permissions (will only work in dev builds)
    const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
    if (backgroundStatus !== 'granted') {
      console.log('Permission to access location in background was denied');
      // Continue anyway, as this might be in Expo Go where background permissions aren't available
    }

    // Check if the task is already running
    const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)
      .catch(() => false); // Handle potential errors
    
    if (hasStarted) {
      console.log('Background location is already running');
      return true;
    }

    // Configure background updates
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 300000, // Check every 5 minutes
      distanceInterval: 100, // Minimum movement in meters
      deferredUpdatesInterval: 300000,
      deferredUpdatesDistance: 100,
      foregroundService: {
        notificationTitle: "EchoSpot is using your location",
        notificationBody: "To discover nearby voice notes",
        notificationColor: "#00ff9d"
      },
    });
    
    console.log('Background location tracking started');
    return true;
  } catch (error) {
    console.error("Error starting location tracking:", error);
    // Log more detailed error information
    if (error instanceof Error) {
      console.error(`Error name: ${error.name}, message: ${error.message}`);
    }
    return false;
  }
}

// Define your tab layout
export default function TabLayout() {
  useEffect(() => {
    // Set up notifications and location tracking
    const setupBackgroundServices = async () => {
      // Configure notifications first
      const notificationsConfigured = await configureNotifications();
      
      if (notificationsConfigured) {
        // Then start location tracking
        await startLocationTracking();
      }
      
      // Check for pending notifications
      const pendingNotificationsJson = await AsyncStorage.getItem('pendingNotifications');
      if (pendingNotificationsJson) {
        try {
          const pendingNotifications = JSON.parse(pendingNotificationsJson);
          const timestamp = new Date(pendingNotifications.timestamp);
          const now = new Date();
          
          // Only show notification if it's recent (within last 15 minutes)
          if (now.getTime() - timestamp.getTime() < 15 * 60 * 1000) {
            const { count } = pendingNotifications;
            import('../../utils/notification').then(notification => {
              notification.sendProximityNotification(count);
            });
          }
          
          // Clear pending notifications
          await AsyncStorage.removeItem('pendingNotifications');
        } catch (error) {
          console.error("Error handling pending notifications:", error);
        }
      }
    };
    
    // Set up notification response handling
    const subscription = addNotificationResponseListener(response => {
      // Handle notification taps here
      const data = response.notification.request.content.data;
      
      if (data?.type === 'proximity') {
        // Navigate to map or notes list, etc.
        // router.push('/map');
      }
    });
    
    setupBackgroundServices();
    
    // Cleanup
    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1a1a1a',
          borderTopColor: '#333',
        },
        tabBarActiveTintColor: '#00ff9d',
        tabBarInactiveTintColor: '#888',
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          tabBarIcon: ({ size, color }) => <MapPin size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: 'Record',
          tabBarIcon: ({ size, color }) => <Mic size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notes',
          tabBarIcon: ({ size, color }) => <Bell size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ size, color }) => <User size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ size, color }) => <Settings2 size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}