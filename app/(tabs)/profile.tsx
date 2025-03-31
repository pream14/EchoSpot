import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Bell, MapPin, User, X, Mic } from 'lucide-react-native';

interface UserProfile {
  username: string;
  email: string;
  notesCount: number;
  joinedDate: string;
  timeSinceJoining?: { value: number; label: string };
}

interface VoiceNote {
  _id: string;
  user_id: string;
  file_name: string;
  location?: {
    // Update the location interface to match what's coming from the API
    coordinates?: [number, number]; // [longitude, latitude]
  };
  hidden_until?: string;
  created_at: string;
  audio_data?: number;
}

export default function ProfileScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<VoiceNote | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  useEffect(() => {
    // Load both profile and voice notes
    async function loadData() {
      try {
        await loadProfile();
        await fetchVoiceNotes();
        setLoading(false);
      } catch (err) {
        setError((err as Error).message || 'An error occurred');
        setLoading(false);
      }
    }
    
    loadData();
  }, []);

  // Update profile when voice notes change
  useEffect(() => {
    if (profile && voiceNotes.length >= 0) {
      setProfile(prevProfile => ({
        ...prevProfile!,
        notesCount: voiceNotes.length
      }));
    }
  }, [voiceNotes]);

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
        notesCount: 0, // This will be updated after fetching voice notes
        joinedDate: new Date(data.user_data.created_at).toDateString(),
        timeSinceJoining
      };

      setProfile(userProfile);
      await AsyncStorage.setItem('userProfile', JSON.stringify(userProfile));
      return userProfile;
    } catch (err) {
      const errorMessage = (err as Error).message || 'Failed to load profile';
      throw new Error(errorMessage);
    }
  };

  const fetchVoiceNotes = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) throw new Error('No token found');

      const response = await fetch('https://echo-trails-backend.vercel.app/audio/user/files', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error('Failed to fetch voice notes');

      const data = await response.json();
      console.log("Voice notes received:", data.audio_files?.length || 0);
      
      // Store the voice notes
      const notes = data.audio_files || [];
      setVoiceNotes(notes);
      
      return notes;
    } catch (err) {
      console.error('Error fetching voice notes:', err);
      throw err;
    }
  };

  const openNoteDetails = (note: VoiceNote) => {
    console.log("Opening note details:", note._id);
    // Safely log location data
    console.log("Location data:", note.location?.coordinates);
    setSelectedNote(note);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedNote(null);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Not available';
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch (e) {
      return 'Invalid date';
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
          <TouchableOpacity 
            style={styles.statItem}
            onPress={() => {/* This could expand to show all notes */}}
          >
            <MapPin size={24} color="#00ff9d" />
            <Text style={styles.statNumber}>{profile?.notesCount}</Text>
            <Text style={styles.statLabel}>Voice Notes</Text>
          </TouchableOpacity>
          
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

        {/* Recent Voice Notes section - placed near notifications */}
        <View style={styles.recentNotesSection}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>Recent Voice Notes</Text>
          </View>
          
          {voiceNotes.length === 0 ? (
            <Text style={styles.emptyText}>No voice notes found</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.horizontalScroll}>
              {voiceNotes.map(note => (
                <TouchableOpacity 
                  key={note._id} 
                  style={styles.noteCard}
                  onPress={() => openNoteDetails(note)}
                >
                  <View style={styles.noteIconContainer}>
                    <Mic size={24} color="#00ff9d" />
                  </View>
                  <Text style={styles.noteCardName} numberOfLines={1}>{note.file_name}</Text>
                  <Text style={styles.noteCardDate}>{new Date(note.created_at).toLocaleDateString()}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={closeModal}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Voice Note Details</Text>
              <TouchableOpacity onPress={closeModal} style={styles.closeButton}>
                <X size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            {selectedNote && (
              <View style={styles.noteDetails}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>File Name:</Text>
                  <Text style={styles.detailValue}>{selectedNote.file_name}</Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Created:</Text>
                  <Text style={styles.detailValue}>{formatDate(selectedNote.created_at)}</Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Hidden Until:</Text>
                  <Text style={styles.detailValue}>{formatDate(selectedNote.hidden_until)}</Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Location:</Text>
                  <Text style={styles.detailValue}>
                    {selectedNote.location?.coordinates ? 
                      // Access coordinates safely with optional chaining and correct indexes
                      `${selectedNote.location.coordinates[1].toFixed(4)}, ${selectedNote.location.coordinates[0].toFixed(4)}`
                      : 'Location not available'
                    }
                  </Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Audio Size:</Text>
                  <Text style={styles.detailValue}>
                    {selectedNote.audio_data !== undefined ? `${selectedNote.audio_data} bytes` : 'Not available'}
                  </Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Note ID:</Text>
                  <Text style={styles.detailValue}>{selectedNote._id}</Text>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>
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
    paddingBottom: 40,
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
  recentNotesSection: {
    marginTop: 25,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  emptyText: {
    color: '#888',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  horizontalScroll: {
    marginBottom: 20,
  },
  noteCard: {
    backgroundColor: '#2a2a2a',
    borderRadius: 12,
    padding: 15,
    marginRight: 15,
    width: 150,
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noteIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 255, 157, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  noteCardName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  noteCardDate: {
    color: '#888',
    fontSize: 12,
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  modalContent: {
    width: '90%',
    backgroundColor: '#2a2a2a',
    borderRadius: 15,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#444',
    paddingBottom: 10,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  closeButton: {
    padding: 5,
  },
  noteDetails: {
    marginTop: 10,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    paddingBottom: 10,
  },
  detailLabel: {
    color: '#00ff9d',
    fontSize: 16,
    fontWeight: 'bold',
    width: '35%',
  },
  detailValue: {
    color: '#fff',
    fontSize: 16,
    width: '65%',
  },
});