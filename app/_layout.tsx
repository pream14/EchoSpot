import { useEffect, useState } from 'react';
import { Stack, useRouter, useNavigationContainerRef } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { configureNotifications } from '../utils/notification';

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const router = useRouter();
  const navigationRef = useNavigationContainerRef(); // Ensure navigation is ready

  useEffect(() => {
    const initialize = async () => {
      try {
        await configureNotifications();

        // Wait until navigation is ready
        if (!navigationRef.isReady()) {
          return;
        }

        const token = await AsyncStorage.getItem("authToken");
        console.log("Token:", token);

        if (!token) {
          console.log("Redirecting to LoginScreen...");
          setTimeout(() => {
            router.replace("/LoginScreen");
          }, 500); // Delay to prevent race condition
        } else {
          setIsAuthenticated(true);
        }
      } catch (error) {
        console.error("Error during initialization:", error);
      } finally {
        setIsReady(true);
      }
    };

    initialize();
  }, [navigationRef]);

  if (!isReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#000" }}>
        <ActivityIndicator size="large" color="#00ff9d" />
      </View>
    );
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}
