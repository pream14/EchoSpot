import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Bell, MapPin, User } from 'lucide-react-native';

interface UserProfile {
  username: string;
  email: string;
  notesCount: number;
  joinedDate: string;
  timeSinceJoining?: { value: number; label: string };
}

export default function ProfileScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const getTimeSinceJoining = (createdAt: string) => {
    const createdDate = new Date(createdAt);
    const currentDate = new Date();

    const diffInMs = currentDate.getTime() - createdDate.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays >= 365) {
      const years = Math.floor(diffInDays / 365);
      return { value: years, label: years === 1 ? 'Year' : 'Years' };
    } else if (diffInDays >= 30) {
      const months = Math.floor(diffInDays / 30);
      return { value: months, label: months === 1 ? 'Month' : 'Months' };
    } else {
      return { value: diffInDays, label: diffInDays === 1 ? 'Day' : 'Days' };
    }
  };

  const loadProfile = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) throw new Error('No token found');

      const response = await fetch('https://echo-trails-backend.vercel.app/users/identify', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error('Failed to fetch user data');

      const data = await response.json();
      if (!data.token_info.token_valid) throw new Error('Token expired');

      const timeSinceJoining = getTimeSinceJoining(data.user_data.created_at);

      const userProfile: UserProfile = {
        username: data.user_data.username,
        email: data.user_data.email,
        notesCount: 0,
        joinedDate: new Date(data.user_data.created_at).toDateString(),
        timeSinceJoining
      };

      const voiceNotes = await AsyncStorage.getItem('savedNotes');
      const voiceNotesArray = voiceNotes ? JSON.parse(voiceNotes) : [];
      userProfile.notesCount = Array.isArray(voiceNotesArray) ? voiceNotesArray.length : 0;

      setProfile(userProfile);
      await AsyncStorage.setItem('userProfile', JSON.stringify(userProfile));

    } catch (err) {
      const errorMessage = (err as Error).message || 'Failed to load profile';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
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
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.name}>{profile?.username}</Text>
        <Text style={styles.email}>{profile?.email}</Text>

        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <MapPin size={24} color="#00ff9d" />
            <Text style={styles.statNumber}>{profile?.notesCount}</Text>
            <Text style={styles.statLabel}>Voice Notes</Text>
          </View>
          <View style={styles.statItem}>
            <Bell size={24} color="#00ff9d" />
            <Text style={styles.statNumber}>12</Text>
            <Text style={styles.statLabel}>Notifications</Text>
          </View>
          <View style={styles.statItem}>
            <User size={24} color="#00ff9d" />
            <Text style={styles.statNumber}>{profile?.timeSinceJoining?.value}</Text>
            <Text style={styles.statLabel}>{profile?.timeSinceJoining?.label}</Text>
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
