import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';

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

    return true;
  } catch (error) {
    console.error('Error configuring notifications:', error);
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

// Send notification when user is near a voice note
export const sendProximityNotification = async (count) => {
  try {
    const notificationContent = {
      title: count === 1 ? 'Voice Note Discovered' : 'Voice Notes Discovered',
      body: count === 1 
        ? 'You found a voice note nearby. Tap to listen.' 
        : `You found ${count} voice notes nearby. Tap to listen.`,
      data: { type: 'proximity' },
      sound: 'default',
    };

    await Notifications.scheduleNotificationAsync({
      content: notificationContent,
      trigger: null, // null means show immediately
    });

    console.log(`Proximity notification sent for ${count} notes`);
    return true;
  } catch (error) {
    console.error('Error sending proximity notification:', error);
    return false;
  }
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

// Hook to handle notification navigation
export const useNotificationNavigation = () => {
  const navigation = useNavigation();
  
  const handleNotificationResponse = (response) => {
    const data = response.notification.request.content.data;
    
    // Navigate to the TriggeredNotesScreen when notification is tapped
    if (data.type === 'proximity') {
      navigation.navigate('TriggeredNotesScreen');
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
      navigation.navigate('TriggeredNotesScreen');
    }
  };
  
  // Set up listener and store for cleanup
  const responseListener = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
  
  // Return cleanup function
  return () => {
    Notifications.removeNotificationSubscription(responseListener);
  };
};