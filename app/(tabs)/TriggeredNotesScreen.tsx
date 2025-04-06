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

  // Configure audio mode
  const setupAudio = async () => {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        staysActiveInBackground: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false
      });
      console.log('Audio mode configured successfully');
      return true;
    } catch (error) {
      console.error('Failed to set audio mode:', error);
      return false;
    }
  };

  // Clear audio cache
  const clearAudioCache = async () => {
    try {
      // Unload any existing sounds first
      notes.forEach(async (note) => {
        if (note.sound) {
          await note.sound.unloadAsync();
        }
      });
      console.log('Audio cache cleared');
    } catch (error) {
      console.error('Failed to clear audio cache:', error);
    }
  };

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
      
      // Create audio notes array with playing status
      const audioNotes = parsedNotes.map(note => ({
        ...note,
        playing: false
      }));
      
      // Sort by most recently discovered (we assume the list is in chronological order)
      setNotes([...audioNotes].reverse());
      
      // Clear any pending notifications since user has seen the notes
      await AsyncStorage.removeItem('pendingNotifications');
      
      setLoading(false);
      setRefreshing(false);
      console.log(`Loaded ${audioNotes.length} notes successfully`);
    } catch (error) {
      console.error('Error loading triggered notes:', error instanceof Error ? error.message : 'Unknown error', error);
      setError('Failed to load notes');
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      try {
        // Set up audio - no need to check permissions for playback
        await setupAudio();
        await loadTriggeredNotes();
      } catch (error) {
        console.error('Error in initialization:', error);
        setError('Failed to initialize app');
        setLoading(false);
      }
    };

    initialize();

    // Clean up function to unload all sounds when component unmounts
    return () => {
      notes.forEach(async (note) => {
        if (note.sound) {
          try {
            await note.sound.unloadAsync();
          } catch (error) {
            console.error('Error unloading sound:', error);
          }
        }
      });
    };
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setError(null);
    clearAudioCache();
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
        
        console.log(`Attempting to load audio for note: ${noteId}`);
        
        // Create the audio source with authorization header
        const audioSource = {
          uri: `https://echo-trails-backend.vercel.app/audio/files/${noteId}/download`,
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        };
        
        console.log('Audio source created:', JSON.stringify(audioSource));
        
        // Load the audio file with better error handling
        try {
          console.log('Starting audio load process...');
          const { sound } = await Audio.Sound.createAsync(
            audioSource,
            { shouldPlay: true, progressUpdateIntervalMillis: 1000 },
            (status) => {
              console.log('Playback status update:', JSON.stringify(status)); 
              // When playback ends
              if (status.isLoaded && status.didJustFinish) {
                console.log('Playback finished for note:', noteId);
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
          
          console.log('Audio loaded successfully for note:', noteId);
          
          // Ensure volume is at maximum
          await sound.setVolumeAsync(1.0);
          
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
        } catch (loadError) {
          console.error('Error loading audio:', loadError instanceof Error ? loadError.message : 'Unknown load error', loadError);
          throw loadError; // Propagate error to outer catch block
        }
      }
    } catch (error) {
      console.error('Error playing audio:', error instanceof Error ? error.message : 'Unknown error', error);
      
      // Reset loading state on error
      setNotes(prevNotes => {
        const newNotes = [...prevNotes];
        const index = newNotes.findIndex(n => n.id === noteId);
        if (index !== -1) {
          newNotes[index].loading = false;
        }
        return newNotes;
      });
      
      Alert.alert('Error', 'Failed to play audio. Please try again.');
    }
  };

  const goBack = () => {
    router.back();
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#00ff9d" />
        <Text style={styles.loadingText}>Loading discovered voice notes...</Text>
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
          ? 'You\'ve discovered a voice note' 
          : `You've discovered ${notes.length} voice notes`}
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
                {note.distance && (
                  <Text style={styles.noteDistance}>Discovered {note.distance} meters away</Text>
                )}
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