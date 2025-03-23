// app/(tabs)/settings.tsx
import React, { useState, useEffect } from 'react';
import { View, Text, Switch, StyleSheet, Alert,TouchableOpacity } from 'react-native';
import { Bell, Moon, Volume2, MapPin, Lock, Shield, Trash2, CircleHelp as HelpCircle } from 'lucide-react-native';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';


export default function SettingsScreen() {
  const router = useRouter(); // ✅ Initialize useRouter inside the component

  const [isBackgroundTrackingEnabled, setIsBackgroundTrackingEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if background tracking is enabled
    const checkBackgroundTracking = async () => {
      try {
        const enabled = await AsyncStorage.getItem('backgroundTrackingEnabled');
        setIsBackgroundTrackingEnabled(enabled === 'true');
        setIsLoading(false);
      } catch (error) {
        console.error("Error checking background tracking status:", error);
        setIsLoading(false);
      }
    };

    checkBackgroundTracking();
  }, []);
  const handleSignOut = async () => {
    try {
      await AsyncStorage.removeItem("authToken"); // Remove stored authentication token
      router.replace("/LoginScreen"); // Redirect to login screen
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handleBackgroundTrackingToggle = async (value: boolean) => {
    if (value) {
      // If turning on, request permissions
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        Alert.alert(
          'Location Permission Required',
          'EchoSpot needs location permission to discover nearby voice notes.',
          [{ text: 'OK' }]
        );
        return;
      }

      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus !== 'granted') {
        Alert.alert(
          'Background Location Permission Required',
          'EchoSpot needs background location permission to discover nearby voice notes even when the app is closed.',
          [{ text: 'OK' }]
        );
        return;
      }

      // Start background location tracking
      const LOCATION_TASK_NAME = 'background-location-task';
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      
      if (!hasStarted) {
        await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 300000,
          distanceInterval: 100,
          foregroundService: {
            notificationTitle: "EchoSpot is using your location",
            notificationBody: "To discover nearby voice notes",
            notificationColor: "#00ff9d"
          },
        });
      }
    } else {
      // Stop background location tracking
      const LOCATION_TASK_NAME = 'background-location-task';
      const hasStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      
      if (hasStarted) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
    }

    // Save preference
    await AsyncStorage.setItem('backgroundTrackingEnabled', value ? 'true' : 'false');
    setIsBackgroundTrackingEnabled(value);
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      
      <View style={styles.settingItem}>
        <Text style={styles.settingLabel}>Background Location Tracking</Text>
        <Switch
          trackColor={{ false: '#767577', true: '#4caf5077' }}
          thumbColor={isBackgroundTrackingEnabled ? '#4caf50' : '#f4f3f4'}
          ios_backgroundColor="#3e3e3e"
          onValueChange={handleBackgroundTrackingToggle}
          value={isBackgroundTrackingEnabled}
        />
      </View>
      
      <Text style={styles.helpText}>
        When enabled, EchoSpot will check for nearby voice notes even when the app is closed.
        This helps you discover notes left by others without having to keep the app open.
      </Text>
      <TouchableOpacity style={styles.dangerButton} onPress={handleSignOut}>
        <Trash2 size={24} color="#ff4d4d" />
        <Text style={styles.dangerButtonText}>sign out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 20,
    marginTop: 50,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  settingLabel: {
    fontSize: 16,
    color: '#fff',
  },
  helpText: {
    marginTop: 10,
    fontSize: 14,
    color: '#aaa',
    lineHeight: 20,
  },
    dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#331111',
    margin: 20,
    padding: 15,
    borderRadius: 12,
    gap: 10,
  },
  dangerButtonText: {
    color: '#ff4d4d',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 50,
  },
});