import { Tabs } from 'expo-router';
import { MapPin, Mic, User, Bell, Settings2 } from 'lucide-react-native';
import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { 
  configureNotifications, 
  addNotificationResponseListener, 
  sendProximityNotification,
  initNotificationTracker
} from '../../utils/notification';
import { defineLocationTask, restartBackgroundLocationTracking } from '../../utils/LocationService';

export default function TabLayout() {
  const router = useRouter();

  useEffect(() => {
    // Define the location task first
    defineLocationTask();
    
    // Set up notifications and location tracking
    const setupBackgroundServices = async () => {
      console.log("Setting up background services...");
      
      // Configure notifications first
      const notificationsConfigured = await configureNotifications();
      console.log("Notifications configured:", notificationsConfigured);
      
      // Make sure notification tracker is initialized
      await initNotificationTracker();
      
      if (notificationsConfigured) {
        // Check if tracking should be enabled (from user preference)
        const isEnabled = await AsyncStorage.getItem('backgroundTrackingEnabled');
        console.log("Background tracking preference:", isEnabled);
        
        if (isEnabled === 'true') {
          // Always restart to ensure reliable tracking
          const started = await restartBackgroundLocationTracking();
          console.log("Location tracking started:", started);
        }
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
            const { count, noteIds = [] } = pendingNotifications;
            await sendProximityNotification(count, noteIds);
            console.log("Sent pending notification for", count, "notes");
          }
          
          // Clear pending notifications
          await AsyncStorage.removeItem('pendingNotifications');
        } catch (error) {
          console.error("Error handling pending notifications:", error);
        }
      }
      
      // Check triggered notes
      const triggeredNotesJson = await AsyncStorage.getItem('triggeredNotes');
      if (triggeredNotesJson) {
        try {
          const triggeredNotes = JSON.parse(triggeredNotesJson);
          console.log("Found triggered notes:", triggeredNotes.length);
        } catch (error) {
          console.error("Error checking triggered notes:", error);
        }
      } else {
        console.log("No triggered notes found");
      }
    };
    
    // Set up notification response handling
    const subscription = addNotificationResponseListener(
      (response: Notifications.NotificationResponse) => {
        const data = response.notification.request.content.data;
        if (data && data.type === 'proximity') {
          console.log('Notification tapped, navigating to TriggeredNotesScreen');
          // Pass the noteIds to the TriggeredNotesScreen if available
          if (data.noteIds) {
            router.push({
              pathname: '/TriggeredNotesScreen',
              params: { noteIds: JSON.stringify(data.noteIds) }
            });
          } else {
            router.push('/TriggeredNotesScreen');
          }
        }
      }
    );
    
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
        name="TriggeredNotesScreen"
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