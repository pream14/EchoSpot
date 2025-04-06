import { useEffect, useState } from 'react';
import { Stack, useRouter, useNavigationContainerRef } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { 
  configureNotifications, 
  addNotificationResponseListener 
} from '../utils/notification';
import * as Notifications from 'expo-notifications';

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const router = useRouter();
  const navigationRef = useNavigationContainerRef();

  useEffect(() => {
    const initialize = async () => {
      try {
        await configureNotifications();

        if (!navigationRef.isReady()) return;

        const token = await AsyncStorage.getItem('acessToken');
        console.log('Token:', token);

        if (!token) {
          console.log('No token found. Redirecting to LoginScreen...');
          router.replace('/LoginScreen');
          return;
        }

        const isTokenValid = await validateToken(token);

        if (!isTokenValid) {
          console.log('Token is invalid or expired. Redirecting...');
          await AsyncStorage.removeItem('acessToken');
          router.replace('/LoginScreen');
        }
      } catch (error) {
        console.error('Error during initialization:', error);
        router.replace('/LoginScreen');
      } finally {
        setIsReady(true);
      }
    };

    initialize();
  }, [navigationRef]);

  const validateToken = async (token: string): Promise<boolean> => {
    try {
      const response = await fetch('https://echo-trails-backend.vercel.app/users/identify', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        console.warn('Token validation failed with status:', response.status);
        return false;
      }

      const data = await response.json();
      return data?.token_info?.token_valid === true;
    } catch (err) {
      console.error('Token validation error:', err);
      return false;
    }
  };

  useEffect(() => {
    if (!navigationRef.isReady()) return;

    const responseListener = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;
        if (data.type === 'proximity') {
          console.log('Notification tapped, navigating to TriggeredNotesScreen');
          router.push('/TriggeredNotesScreen');
        }
      }
    );

    return () => {
      Notifications.removeNotificationSubscription(responseListener);
    };
  }, [navigationRef.isReady()]);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator size="large" color="#00ff9d" />
      </View>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="TriggeredNotesScreen" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}
