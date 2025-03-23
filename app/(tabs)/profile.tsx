import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Bell, MapPin, User } from 'lucide-react-native';

interface UserProfile {
  username: string;
  email: string;
  notesCount: number;
  joinedDate: string;
  avatar: string;
}

const defaultProfile: UserProfile = {
  username: 'John Doe',
  email: 'john.doe@example.com',
  notesCount: 0,
  joinedDate: '2024-01-01',
  avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80',
};

export default function ProfileScreen() {
  const [profile, setProfile] = useState<UserProfile>(defaultProfile);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const storedProfile = await AsyncStorage.getItem('user');
      const userProfile: UserProfile = storedProfile ? JSON.parse(storedProfile) : defaultProfile;

      // Fetch saved notes and update the count
      const voiceNotes = await AsyncStorage.getItem('savedNotes');
      const voiceNotesArray = voiceNotes ? JSON.parse(voiceNotes) : [];
      const notesCount = Array.isArray(voiceNotesArray) ? voiceNotesArray.length : 0;

      // Update profile with correct notes count
      const updatedProfile = { ...userProfile, notesCount };
      setProfile(updatedProfile);

      // Save updated profile
      await AsyncStorage.setItem('userProfile', JSON.stringify(updatedProfile));

      setLoading(false);
    } catch (err) {
      setError('Failed to load profile');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Image style={styles.coverImage} />
        <View style={styles.profileImageContainer}>
          <Image source={{ uri: profile.avatar }} style={styles.profileImage} />
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.name}>{profile.username}</Text>
        <Text style={styles.email}>{profile.email}</Text>

        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <MapPin size={24} color="#00ff9d" />
            <Text style={styles.statNumber}>{profile.notesCount}</Text>
            <Text style={styles.statLabel}>Voice Notes</Text>
          </View>
          <View style={styles.statItem}>
            <Bell size={24} color="#00ff9d" />
            <Text style={styles.statNumber}>12</Text>
            <Text style={styles.statLabel}>Notifications</Text>
          </View>
          <View style={styles.statItem}>
            <User size={24} color="#00ff9d" />
            <Text style={styles.statNumber}>3</Text>
            <Text style={styles.statLabel}>Months</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  header: {
    height: 200,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: 150,
    resizeMode: 'cover',
  },
  profileImageContainer: {
    position: 'absolute',
    bottom: -50,
    left: '50%',
    transform: [{ translateX: -50 }],
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 4,
    borderColor: '#1a1a1a',
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  email: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginTop: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 30,
    paddingVertical: 20,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#333',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
  errorText: {
    color: '#ff4d4d',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
  },
});

