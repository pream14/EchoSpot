import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Store to track recently sent notifications
let notificationTracker = {
  lastNotificationTime: 0,
  notifiedNoteIds: new Set(),
};

// Constants
const NOTIFICATION_COOLDOWN = 60000; // 1 minute cooldown between similar notifications
const NOTIFICATION_STORAGE_KEY = 'last_proximity_notification';

// Load previous notification state from storage (call this on app start)
export const initNotificationTracker = async () => {
  try {
    const storedData = await AsyncStorage.getItem(NOTIFICATION_STORAGE_KEY);
    if (storedData) {
      const parsed = JSON.parse(storedData);
      notificationTracker = {
        lastNotificationTime: parsed.lastNotificationTime || 0,
        notifiedNoteIds: new Set(parsed.notifiedNoteIds || [])
      };
    }
  } catch (error) {
    console.error('Error loading notification tracker:', error);
  }
};

// Save notification state to storage
const saveNotificationState = async () => {
  try {
    const dataToStore = {
      lastNotificationTime: notificationTracker.lastNotificationTime,
      notifiedNoteIds: Array.from(notificationTracker.notifiedNoteIds)
    };
    await AsyncStorage.setItem(NOTIFICATION_STORAGE_KEY, JSON.stringify(dataToStore));
  } catch (error) {
    console.error('Error saving notification state:', error);
  }
};

// Configure notifications for the app
export const configureNotifications = async () => {
  try {
    // Check if device can receive notifications
    if (!Device.isDevice) {
      console.log('Notifications not available on simulator/emulator');
      return false;
    }

    // Request permission
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    
    if (finalStatus !== 'granted') {
      console.log('Failed to get notification permission');
      return false;
    }

    // Configure how notifications appear when the app is in foreground
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });

    // Get push token for remote notifications (if needed in the future)
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#00FF9D',
      });
    }

    // Initialize the notification tracker
    await initNotificationTracker();

    return true;
  } catch (error) {
    console.error('Error configuring notifications:', error);
    return false;
  }
};

// Send notification when user is near a voice note
export const sendProximityNotification = async (count, noteIds = []) => {
  try {
    const now = Date.now();
    
    // Check if we've recently sent a notification
    if (now - notificationTracker.lastNotificationTime < NOTIFICATION_COOLDOWN) {
      console.log('Skipping notification: cooldown period active');
      return false;
    }
    
    // Check if we've already notified about these specific notes
    const newNoteIds = noteIds.filter(id => !notificationTracker.notifiedNoteIds.has(id));
    
    // If all notes have been notified about recently, skip notification
    if (noteIds.length > 0 && newNoteIds.length === 0) {
      console.log('Skipping notification: already notified about these notes');
      return false;
    }
    
    // Now we can send a notification
    const notificationContent = {
      title: count === 1 ? 'Voice Note Discovered' : 'Voice Notes Discovered',
      body: count === 1 
        ? 'You found a voice note nearby. Tap to listen.' 
        : `You found ${count} voice notes nearby. Tap to listen.`,
      data: { 
        type: 'proximity',
        noteIds: noteIds 
      },
      sound: 'default',
    };

    await Notifications.scheduleNotificationAsync({
      content: notificationContent,
      trigger: null, // null means show immediately
    });

    // Update our tracker
    notificationTracker.lastNotificationTime = now;
    noteIds.forEach(id => notificationTracker.notifiedNoteIds.add(id));
    
    // Save state
    await saveNotificationState();

    console.log(`Proximity notification sent for ${count} notes`);
    return true;
  } catch (error) {
    console.error('Error sending proximity notification:', error);
    return false;
  }
};

// Reset notification tracking for specific notes (call when notes are listened to)
export const resetNotificationForNotes = async (noteIds) => {
  if (!Array.isArray(noteIds)) noteIds = [noteIds];
  
  noteIds.forEach(id => {
    notificationTracker.notifiedNoteIds.delete(id);
  });
  
  await saveNotificationState();
};

// Reset all notification tracking (useful when testing or debugging)
export const resetAllNotificationTracking = async () => {
  notificationTracker = {
    lastNotificationTime: 0,
    notifiedNoteIds: new Set()
  };
  
  await saveNotificationState();
};

// Cancel all notifications
export const cancelAllNotifications = async () => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return true;
  } catch (error) {
    console.error('Error cancelling notifications:', error);
    return false;
  }
};

// Add a listener for notification responses (when notification is tapped)
export const addNotificationResponseListener = (handler) => {
  return Notifications.addNotificationResponseReceivedListener(handler);
};

// Add a listener for notifications received while app is running
export const addNotificationReceivedListener = (handler) => {
  return Notifications.addNotificationReceivedListener(handler);
};

// Hook to handle notification navigation
export const useNotificationNavigation = () => {
  const navigation = useNavigation();
  
  const handleNotificationResponse = (response) => {
    const data = response.notification.request.content.data;
    
    // Navigate to the TriggeredNotesScreen when notification is tapped
    if (data.type === 'proximity') {
      navigation.navigate('TriggeredNotesScreen', { noteIds: data.noteIds });
    }
  };
  
  return { handleNotificationResponse };
};

// Function to set up notification navigation in app root component
export const setupNotificationNavigation = (navigation) => {
  // This should be called in a component that has access to navigation
  // but isn't affected by navigation unmounts (like App.js or a navigation container)
  
  const handleNotificationResponse = (response) => {
    const data = response.notification.request.content.data;
    
    if (data.type === 'proximity') {
      navigation.navigate('TriggeredNotesScreen', { noteIds: data.noteIds });
    }
  };
  
  // Set up listener and store for cleanup
  const responseListener = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
  
  // Return cleanup function
  return () => {
    Notifications.removeNotificationSubscription(responseListener);
  };
};