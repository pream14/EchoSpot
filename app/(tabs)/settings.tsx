import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Switch, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Bell, Moon, Volume2, MapPin, Lock, Shield, Trash2, CircleHelp as HelpCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useRouter } from "expo-router";

import AsyncStorage from "@react-native-async-storage/async-storage";

// import { api } from '@/utils/api';

interface Settings {
  notifications: boolean;
  darkMode: boolean;
  soundEffects: boolean;
  locationTracking: boolean;
  biometricLock: boolean;
}

export default function SettingsScreen() {
  const router = useRouter(); // ✅ Initialize useRouter inside the component

  const [settings, setSettings] = useState<Settings>({
    notifications: true,
    darkMode: true,
    soundEffects: true,
    locationTracking: true,
    biometricLock: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      // const response = await api.get('/api/settings');
      // setSettings(response.data);
      setLoading(false);
    } catch (error) {
      console.error('Failed to load settings:', error);
      setLoading(false);
    }
  };

  const handleToggle = async (key: keyof Settings) => {
    try {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      
      const newValue = !settings[key];
      // await api.post('/api/settings/update', { [key]: newValue });
      setSettings(prev => ({ ...prev, [key]: newValue }));
    } catch (error) {
      console.error('Failed to update setting:', error);
    }
  };
  const handleSignOut = async () => {
    try {
      await AsyncStorage.removeItem("authToken"); // Remove stored authentication token
      router.replace("/LoginScreen"); // Redirect to login screen
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };
  const SettingItem = ({ 
    icon: Icon, 
    title, 
    description, 
    value, 
    onToggle 
  }: {
    icon: any,
    title: string,
    description: string,
    value: boolean,
    onToggle: () => void
  }) => (
    <View style={styles.settingItem}>
      <View style={styles.settingIcon}>
        <Icon size={24} color="#00ff9d" />
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#333', true: '#00ff9d' }}
        thumbColor={value ? '#fff' : '#666'}
      />
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <SettingItem
          icon={Bell}
          title="Push Notifications"
          description="Receive alerts for nearby voice notes"
          value={settings.notifications}
          onToggle={() => handleToggle('notifications')}
        />
        <SettingItem
          icon={Volume2}
          title="Sound Effects"
          description="Play sounds for interactions"
          value={settings.soundEffects}
          onToggle={() => handleToggle('soundEffects')}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy & Security</Text>
        <SettingItem
          icon={MapPin}
          title="Location Tracking"
          description="Allow background location updates"
          value={settings.locationTracking}
          onToggle={() => handleToggle('locationTracking')}
        />
        <SettingItem
          icon={Lock}
          title="Biometric Lock"
          description="Secure app with biometric authentication"
          value={settings.biometricLock}
          onToggle={() => handleToggle('biometricLock')}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <SettingItem
          icon={Moon}
          title="Dark Mode"
          description="Use dark theme throughout the app"
          value={settings.darkMode}
          onToggle={() => handleToggle('darkMode')}
        />
      </View>

      <TouchableOpacity style={styles.dangerButton} onPress={handleSignOut}>
        <Trash2 size={24} color="#ff4d4d" />
        <Text style={styles.dangerButtonText}>sign out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  section: {
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 15,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#333',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#888',
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
    marginTop: 20,
  },
});