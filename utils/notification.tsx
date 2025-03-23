// app/notifications.tsx
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

// Configure notification appearance
export async function configureNotifications(): Promise<boolean> {
  // Check if device is a physical device
  if (!Device.isDevice) {
    console.log('Must use physical device for notifications');
    return false;
  }

  // Request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  
  if (finalStatus !== 'granted') {
    console.log('Failed to get notification permissions');
    return false;
  }

  // Set notification handler for foreground notifications
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await setupAndroidChannel();
  }

  return true;
}

// Set up notification channel for Android
export async function setupAndroidChannel() {
  await Notifications.setNotificationChannelAsync('nearby-notes', {
    name: 'Nearby Voice Notes',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#00ff9d',
    sound: 'default',
  });
}

// Send notification for nearby notes
export async function sendProximityNotification(noteCount: number): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Voice Notes Nearby!",
      body: `You're near ${noteCount} voice ${noteCount === 1 ? 'note' : 'notes'}. Open the app to discover!`,
      data: { type: 'proximity' },
      sound: true,
      badge: 1,
      ...(Platform.OS === 'android' && { channelId: 'nearby-notes' }),
    },
    trigger: null, // Send immediately
  });
}

// Add a listener for notification handling
export function addNotificationResponseListener(callback: (response: Notifications.NotificationResponse) => void): Notifications.Subscription {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

// Add a listener for received notifications
export function addNotificationReceivedListener(callback: (notification: Notifications.Notification) => void): Notifications.Subscription {
  return Notifications.addNotificationReceivedListener(callback);
}

