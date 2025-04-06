import React, { useState, useEffect } from 'react';
import { View, Text, Switch, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { Bell, Moon, Volume2, MapPin, Lock, Shield, Trash2, CircleHelp as HelpCircle } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, useRouter } from 'expo-router';
import { startBackgroundLocationTracking, stopBackgroundLocationTracking, isBackgroundLocationTrackingEnabled, restartBackgroundLocationTracking } from '../../utils/LocationService';
import { configureNotifications } from '../../utils/notification';

export default function SettingsScreen() {
  const router = useRouter();

  const [isBackgroundTrackingEnabled, setIsBackgroundTrackingEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if background tracking is enabled
    const checkBackgroundTracking = async () => {
      try {
        // Ensure notifications are configured
        await configureNotifications();
        
        const enabled = await isBackgroundLocationTrackingEnabled();
        console.log("Background tracking status check:", enabled);
        setIsBackgroundTrackingEnabled(enabled);
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
      await AsyncStorage.removeItem("accessToken");
      router.replace("/LoginScreen");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handleBackgroundTrackingToggle = async (value: boolean) => {
    try {
      if (value) {
        // Start background tracking
        const success = await restartBackgroundLocationTracking(); // Use restart for better reliability
        if (!success) {
          Alert.alert(
            'Permission Error',
            'Unable to start location tracking. Please check your permissions.',
            [{ text: 'OK' }]
          );
          return;
        }
      } else {
        // Stop background tracking
        await stopBackgroundLocationTracking();
      }
      
      setIsBackgroundTrackingEnabled(value);
    } catch (error) {
      console.error("Error toggling background tracking:", error);
      Alert.alert('Error', 'Failed to change tracking settings');
    }
  };

  const handleRestartTracking = async () => {
    try {
      setIsLoading(true);
      await stopBackgroundLocationTracking();
      const success = await restartBackgroundLocationTracking();
      
      if (success) {
        Alert.alert('Success', 'Location tracking has been restarted');
        setIsBackgroundTrackingEnabled(true);
      } else {
        Alert.alert('Error', 'Failed to restart tracking');
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error("Error restarting tracking:", error);
      Alert.alert('Error', 'Failed to restart tracking');
      setIsLoading(false);
    }
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
      
      {isBackgroundTrackingEnabled && (
        <TouchableOpacity style={styles.restartButton} onPress={handleRestartTracking}>
          <MapPin size={24} color="#00ff9d" />
          <Text style={styles.restartButtonText}>Restart Location Tracking</Text>
        </TouchableOpacity>
      )}
      
      <TouchableOpacity style={styles.dangerButton} onPress={handleSignOut}>
        <Trash2 size={24} color="#ff4d4d" />
        <Text style={styles.dangerButtonText}>Sign Out</Text>
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
  restartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#113322',
    marginTop: 20,
    padding: 15,
    borderRadius: 12,
    gap: 10,
  },
  restartButtonText: {
    color: '#00ff9d',
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