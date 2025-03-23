import { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TextInput,
  Platform,
} from "react-native";
import { Audio } from "expo-av";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Mic, Square, Play, MapPin, Save, Trash2, Upload, StopCircle } from "lucide-react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import uuid from "react-native-uuid";
import * as DocumentPicker from "expo-document-picker";

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
      let noteLocation = customLocation || location?.coords;
      if (!noteLocation) {
        console.error("No valid location available.");
        return;
      }

      const newNote: Note = {
        id: uuid.v4() as string,
        title: title || "Untitled Note",
        audioUrl: recordingUri,
        latitude: noteLocation.latitude,
        longitude: noteLocation.longitude,
      };

      const updatedNotes = [...savedNotes, newNote];
      setSavedNotes(updatedNotes);
      await AsyncStorage.setItem("savedNotes", JSON.stringify(updatedNotes));

      setTitle("");
      setRecordingUri(null);
      setCustomLocation(null);
    } catch (error) {
      console.error("Failed to save voice note:", error);
    }
  }

  const handleMapPress = (event: any) => {
    setCustomLocation(event.nativeEvent.coordinate);
  };

  return (
    <View style={styles.container}>
      {location && (
        <MapView
          provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
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
              <View style={styles.marker}>
                <MapPin size={20} color="#00ff9d" />
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

        <TouchableOpacity style={styles.uploadButton} onPress={pickAudioFile}>
          <Upload size={24} color="#fff" />
          <Text style={styles.uploadText}>Upload</Text>
        </TouchableOpacity>

        <View style={styles.buttonRow}>
          {isRecording ? (
            <TouchableOpacity style={[styles.recordButton, styles.recording]} onPress={stopRecording}>
              <Square size={32} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.recordButton} onPress={startRecording}>
              <Mic size={32} color="#fff" />
            </TouchableOpacity>
          )}

          {recordingUri && (
            <>
              <TouchableOpacity style={styles.controlButton} onPress={() => playRecording(recordingUri)}>
                <Play size={24} color="#00ff9d" />
              </TouchableOpacity>

              {isPlaying && (
                <TouchableOpacity style={styles.controlButton} onPress={stopPlayback}>
                  <StopCircle size={24} color="#ff4d4d" />
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.controlButton} onPress={saveVoiceNote}>
                <Save size={24} color="#00ff9d" />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
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
  uploadButton: {
    backgroundColor: 'green', // A vibrant blue color
    paddingVertical: 12,
    paddingHorizontal: 25,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    elevation: 5, // Android shadow
    shadowColor: '#00c9ff', // iOS shadow
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    flexDirection: 'row', // To align an icon if needed
  },
  
  uploadText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
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
});
