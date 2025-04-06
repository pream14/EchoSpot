import React, { useState, useEffect, useCallback } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  ActivityIndicator, 
  ScrollView, 
  Alert,
  RefreshControl
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import { Play, Pause, ArrowLeft } from 'lucide-react-native';

interface NoteItem {
  id: string;
  title: string;
  distance: number;
}

interface AudioNote extends NoteItem {
  playing: boolean;
  loading?: boolean;
  sound?: Audio.Sound;
}

export default function TriggeredNotesScreen() {
  const router = useRouter();
  const [notes, setNotes] = useState<AudioNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const loadTriggeredNotes = async () => {
    try {
      // Load triggered notes data
      const notesJson = await AsyncStorage.getItem('triggeredNotes');
      if (!notesJson) {
        setError('No triggered notes found');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Get auth token for API requests
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) {
        setError('Authentication required');
        setLoading(false);
        setRefreshing(false);
        router.replace('/LoginScreen');
        return;
      }
      
      setAccessToken(token);
      
      // Parse notes and prepare them for display
      const parsedNotes: NoteItem[] = JSON.parse(notesJson);
      
      // Create audio notes array with playing status, then reverse the order
      const audioNotes = parsedNotes.map(note => ({
        ...note,
        playing: false
      }));
      
      // Reverse the array to show notes in reverse order
      setNotes([...audioNotes].reverse());
      
      setLoading(false);
      setRefreshing(false);
    } catch (error) {
      console.error('Error loading triggered notes:', error);
      setError('Failed to load notes');
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadTriggeredNotes();

    // Clean up function to unload all sounds when component unmounts
    return () => {
      notes.forEach(async (note) => {
        if (note.sound) {
          await note.sound.unloadAsync();
        }
      });
    };
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setError(null);
    loadTriggeredNotes();
  }, []);

  const playAudio = async (noteId: string) => {
    try {
      if (!accessToken) {
        Alert.alert('Error', 'Authentication required');
        return;
      }
  
      // First stop any currently playing audio
      const updatedNotes = [...notes];
      for (const note of updatedNotes) {
        if (note.playing && note.sound) {
          await note.sound.stopAsync();
          note.playing = false;
        }
      }
  
      // Find the note to play
      const noteIndex = updatedNotes.findIndex(note => note.id === noteId);
      if (noteIndex === -1) return;
  
      const noteToPlay = updatedNotes[noteIndex];
      
      // If sound is already loaded, toggle play/pause
      if (noteToPlay.sound) {
        if (noteToPlay.playing) {
          await noteToPlay.sound.pauseAsync();
          noteToPlay.playing = false;
        } else {
          await noteToPlay.sound.playAsync();
          noteToPlay.playing = true;
        }
        setNotes([...updatedNotes]);
      } 
      // Otherwise load and play the sound
      else {
        // Set loading state
        setNotes(prevNotes => {
          const newNotes = [...prevNotes];
          newNotes[noteIndex] = {...newNotes[noteIndex], loading: true};
          return newNotes;
        });
        
        // Create the audio source with authorization header
        const audioSource = {
          uri: `https://echo-trails-backend.vercel.app/audio/files/${noteId}/download`,
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        };
        
        // Load the audio file
        const { sound } = await Audio.Sound.createAsync(
          audioSource,
          { shouldPlay: true },
          (status) => {
            // When playback ends - fix for TypeScript error
            if (status.isLoaded && status.didJustFinish) {
              setNotes(prevNotes => {
                const newNotes = [...prevNotes];
                const index = newNotes.findIndex(n => n.id === noteId);
                if (index !== -1) {
                  newNotes[index].playing = false;
                }
                return newNotes;
              });
            }
          }
        );
        
        // Update notes state with sound object and playing status
        setNotes(prevNotes => {
          const newNotes = [...prevNotes];
          const index = newNotes.findIndex(n => n.id === noteId);
          if (index !== -1) {
            newNotes[index].sound = sound;
            newNotes[index].playing = true;
            newNotes[index].loading = false;
          }
          return newNotes;
        });
      }
    } catch (error) {
      console.error('Error playing audio:', error);
      
      // Reset loading state on error
      setNotes(prevNotes => {
        const newNotes = [...prevNotes];
        const index = newNotes.findIndex(n => n.id === noteId);
        if (index !== -1) {
          newNotes[index].loading = false;
        }
        return newNotes;
      });
      
      Alert.alert('Error', 'Failed to play audio');
    }
  };

  const goBack = () => {
    router.back();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#00ff9d" />
        <Text style={styles.loadingText}>Loading nearby voice notes...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.button} onPress={goBack}>
          <Text style={styles.buttonText}>Go Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.retryButton]} onPress={onRefresh}>
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ 
        headerShown: false
      }} />
      
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} style={styles.backButton}>
          <ArrowLeft size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.title}>
          {notes.length === 1 ? 'Voice Note Discovered' : 'Voice Notes Discovered'}
        </Text>
      </View>

      <Text style={styles.subtitle}>
        {notes.length === 1 
          ? 'You\'ve discovered a voice note in this area' 
          : `You've discovered ${notes.length} voice notes in this area`}
      </Text>

      <ScrollView 
        style={styles.notesContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#00ff9d"]}
            tintColor="#00ff9d"
            title="Pull to refresh"
            titleColor="#aaa"
          />
        }
      >
        {notes.length > 0 ? (
          notes.map((note) => (
            <View key={note.id} style={styles.noteCard}>
              <View style={styles.noteInfo}>
                <Text style={styles.noteTitle}>{note.title}</Text>
              </View>
              <TouchableOpacity 
                style={[
                  styles.playButton,
                  note.playing ? styles.playingButton : null
                ]} 
                onPress={() => playAudio(note.id)}
                disabled={note.loading}
              >
                {note.loading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : note.playing ? (
                  <Pause size={24} color="#fff" />
                ) : (
                  <Play size={24} color="#fff" />
                )}
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No voice notes found</Text>
            <Text style={styles.emptyStateSubtext}>Pull down to refresh</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121212',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 50,
    marginBottom: 16,
  },
  backButton: {
    marginRight: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 16,
    color: '#aaa',
    marginBottom: 24,
  },
  notesContainer: {
    flex: 1,
  },
  noteCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1d1d1d',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  noteInfo: {
    flex: 1,
  },
  noteTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  noteDistance: {
    fontSize: 14,
    color: '#00ff9d',
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#00ff9d33',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playingButton: {
    backgroundColor: '#00ff9d66',
  },
  loadingText: {
    color: '#fff',
    fontSize: 16,
    marginTop: 16,
  },
  errorText: {
    color: '#ff4d4d',
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#333',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#00ff9d33',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyStateText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    color: '#aaa',
    fontSize: 14,
  },
});