import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TextInput,
  Alert,
} from "react-native";
import { Audio } from "expo-av";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { 
  Mic, 
  Square, 
  Play, 
  MapPin, 
  Save, 
  Upload, 
  StopCircle 
} from "lucide-react-native";
import MapView, { Marker } from "react-native-maps";
import uuid from "react-native-uuid";
import * as DocumentPicker from "expo-document-picker";

// Import the upload service
import { uploadAudioFile } from "./audioUploadService";

const MAX_DURATION = 60000; // 60 seconds

type Note = {
  id: string;
  title: string;
  audioUrl: string;
  latitude: number;
  longitude: number;
};

export default function RecordScreen() {
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [customLocation, setCustomLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [title, setTitle] = useState("");
  const [savedNotes, setSavedNotes] = useState<Note[]>([]);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const timerRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation);
    })();

    loadSavedNotes();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recording) recording.stopAndUnloadAsync();
    };
  }, []);

  async function loadSavedNotes() {
    const notes = await AsyncStorage.getItem("savedNotes");
    if (notes) {
      setSavedNotes(JSON.parse(notes));
    }
  }

  async function pickAudioFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: false,
      });

      if (result.assets && result.assets.length > 0) {
        const selectedFile = result.assets[0];
        setRecordingUri(selectedFile.uri);
      }
    } catch (error) {
      console.error("Error picking an audio file:", error);
    }
  }

  async function startRecording() {
    try {
      await Audio.requestPermissionsAsync();
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      setRecording(recording);
      setIsRecording(true);
      setDuration(0);

      timerRef.current = setInterval(() => {
        setDuration((prev) => {
          if (prev >= MAX_DURATION) {
            stopRecording();
            return prev;
          }
          return prev + 1000;
        });
      }, 1000);
    } catch (err) {
      console.error("Failed to start recording", err);
    }
  }

  async function stopRecording() {
    if (!recording) return;

    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecordingUri(uri);
      setRecording(null);
      setIsRecording(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    } catch (err) {
      console.error("Failed to stop recording", err);
    }
  }

  async function playRecording(uri: string) {
    try {
      if (sound) {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
      }

      const { sound: newSound } = await Audio.Sound.createAsync({ uri });
      setSound(newSound);
      await newSound.playAsync();
      setIsPlaying(true);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && !status.isPlaying) {
          setIsPlaying(false);
        }
      });
    } catch (err) {
      console.error("Failed to play recording", err);
    }
  }

  async function stopPlayback() {
    if (sound) {
      await sound.stopAsync();
      setIsPlaying(false);
    }
  }

  async function saveVoiceNote() {
    if (!recordingUri) return;

    try {
      setIsUploading(true);

      let noteLocation = customLocation || location?.coords;
      if (!noteLocation) {
        Alert.alert("Error", "No valid location available.");
        setIsUploading(false);
        return;
      }

      // Upload the audio file
      const uploadResult = await uploadAudioFile({
        audioUri: recordingUri,
        latitude: noteLocation.latitude,
        longitude: noteLocation.longitude,
        range: 1000, // Default range in meters
        hiddenUntil: new Date(Date.now() + 24 * 60 * 60 * 1000) // Hidden for 24 hours
      });

      // Create a new note with the server-generated ID
      const newNote: Note = {
        id: uploadResult.id,
        title: title || "Untitled Note",
        audioUrl: recordingUri,
        latitude: noteLocation.latitude,
        longitude: noteLocation.longitude,
      };

      const updatedNotes = [...savedNotes, newNote];
      setSavedNotes(updatedNotes);
      
      // Save to local storage
      await AsyncStorage.setItem("savedNotes", JSON.stringify(updatedNotes));

      // Reset form state
      setTitle("");
      setRecordingUri(null);
      setCustomLocation(null);

      // Show success message
      Alert.alert("Success", "Voice note uploaded successfully");
    } catch (error) {
      console.error("Failed to save voice note:", error);
    } finally {
      setIsUploading(false);
    }
  }

  const handleMapPress = (event: any) => {
    setCustomLocation(event.nativeEvent.coordinate);
  };

  const formatDuration = (milliseconds: number) => {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.container}>
      {location && (
        <MapView
          style={styles.map}
          initialRegion={{
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            latitudeDelta: 0.01,
            longitudeDelta: 0.01,
          }}
          onPress={handleMapPress}
        >
          <Marker coordinate={location.coords}>
            <View style={styles.marker}>
              <MapPin size={20} color="#fff" />
            </View>
          </Marker>

          {customLocation && (
            <Marker coordinate={customLocation}>
              <View style={[styles.marker, styles.customMarker]}>
                <MapPin size={20} color="#fff" />
              </View>
            </Marker>
          )}
        </MapView>
      )}

      <View style={styles.controls}>
        <TextInput
          style={styles.input}
          placeholder="Note title"
          placeholderTextColor="#666"
          value={title}
          onChangeText={setTitle}
        />

        {isRecording && (
          <Text style={styles.durationText}>
            Recording: {formatDuration(duration)}
          </Text>
        )}

        <TouchableOpacity 
          style={styles.uploadButton} 
          onPress={pickAudioFile}
          disabled={isUploading}
        >
          <Upload size={24} color="#fff" />
          <Text style={styles.uploadText}>Upload</Text>
        </TouchableOpacity>

        <View style={styles.buttonRow}>
          {isRecording ? (
            <TouchableOpacity 
              style={[styles.recordButton, styles.recording]} 
              onPress={stopRecording}
              disabled={isUploading}
            >
              <Square size={32} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={styles.recordButton} 
              onPress={startRecording}
              disabled={isUploading}
            >
              <Mic size={32} color="#fff" />
            </TouchableOpacity>
          )}

          {recordingUri && (
            <>
              <TouchableOpacity 
                style={styles.controlButton} 
                onPress={() => playRecording(recordingUri)}
                disabled={isUploading}
              >
                <Play size={24} color="#00ff9d" />
              </TouchableOpacity>

              {isPlaying && (
                <TouchableOpacity 
                  style={styles.controlButton} 
                  onPress={stopPlayback}
                  disabled={isUploading}
                >
                  <StopCircle size={24} color="#ff4d4d" />
                </TouchableOpacity>
              )}

              <TouchableOpacity 
                style={styles.controlButton} 
                onPress={saveVoiceNote}
                disabled={isUploading}
              >
                <Save size={24} color={isUploading ? "#666" : "#00ff9d"} />
              </TouchableOpacity>
            </>
          )}
        </View>

        {isUploading && (
          <Text style={styles.uploadingText}>Uploading...</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // ... (keep the existing styles from the previous implementation)
    container: {
      flex: 1,
      backgroundColor: '#1a1a1a',
    },
    map: {
      width: '100%',
      height: '50%',
    },
    marker: {
      backgroundColor: '#ff4d4d',
      padding: 8,
      borderRadius: 24,
      borderWidth: 2,
      borderColor: '#fff',
    },
    customMarker: {
      backgroundColor: '#00ff9d',
    },
    uploadButton: {
      backgroundColor: 'green',
      paddingVertical: 12,
      paddingHorizontal: 25,
      borderRadius: 25,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      elevation: 5,
      shadowColor: '#00c9ff',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      flexDirection: 'row',
      marginVertical: 15,
    },
    uploadText: {
      color: '#fff',
      fontSize: 18,
      fontWeight: 'bold',
      marginLeft: 8,
    },
    controls: {
      flex: 1,
      padding: 20,
      justifyContent: 'space-between',
    },
    input: {
      backgroundColor: '#333',
      color: '#fff',
      padding: 15,
      borderRadius: 8,
      fontSize: 16,
    },
    noteActions: {
      flexDirection: "row",
      alignItems: "center",
      gap: 15,
    },
    deleteText: {
      color: "#ff4d4d",
      fontSize: 16,
      fontWeight: "bold",
    },
    durationText: {
      color: '#fff',
      fontSize: 18,
      textAlign: 'center',
      marginVertical: 20,
    },
    buttonRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 20,
      marginBottom: 20,
    },
    recordButton: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: '#ff4d4d',
      justifyContent: 'center',
      alignItems: 'center',
      elevation: 5,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
    },
    recording: {
      backgroundColor: '#666',
    },
    controlButton: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: '#333',
      justifyContent: 'center',
      alignItems: 'center',
    },
    helpText: {
      color: '#666',
      textAlign: 'center',
      marginTop: 20,
    },
    noteItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      padding: 15,
      backgroundColor: '#333',
      marginVertical: 5,
      borderRadius: 8,
    },
    noteTitle: {
      color: '#fff',
      fontSize: 16,
    },
  uploadingText: {
    color: '#fff',
    textAlign: 'center',
    marginTop: 10,
    fontSize: 16,
  },
});