import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TextInput,
  Alert,
  Platform,
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
  StopCircle,
  Calendar
} from "lucide-react-native";
import MapView, { Marker } from "react-native-maps";
import * as DocumentPicker from "expo-document-picker";
import DateTimePicker from '@react-native-community/datetimepicker';

// Import the upload service
import { uploadAudioFile } from "./audioUploadService";

const MAX_DURATION = 60000; // 60 seconds

type Note = {
  id: string;
  latitude: number;
  longitude: number;
  range: number;
  hidden_until: Date;
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
  const [hiddenUntil, setHiddenUntil] = useState(new Date(Date.now() )); // Default 24 hours
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState<'date' | 'time'>('date');
  const [range, setRange] = useState(1000); // Default range in meters
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

      // Upload the audio file with the user-selected date and range
      const uploadResult = await uploadAudioFile({
        audioUri: recordingUri,
        latitude: noteLocation.latitude,
        longitude: noteLocation.longitude,
        range: range, // Use the user-defined range
        hiddenUntil: hiddenUntil // User selected date from the calendar
      });
        console.log(uploadResult)
      // Create a new note with the server-generated ID
      const newNote: Note = {
        id: uploadResult.id,
        latitude: noteLocation.latitude,
        longitude: noteLocation.longitude,
        range: uploadResult.range,
        hidden_until: uploadResult.hidden_until,
      };

      const updatedNotes = [...savedNotes, newNote];
      setSavedNotes(updatedNotes);
      
      // Save to local storage
      await AsyncStorage.setItem("savedNotes", JSON.stringify(updatedNotes));

      // Reset form state
      setTitle("");
      setRecordingUri(null);
      setCustomLocation(null);
      setHiddenUntil(new Date(Date.now())); // Reset to default
      setRange(1000); // Reset range to default

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

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const onChangeDatePicker = (event: any, selectedDate?: Date) => {
    const currentDate = selectedDate || hiddenUntil;
    
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      
      // If we're in date mode and a valid date was selected, 
      // switch to time mode after selecting the date (Android only)
      if (datePickerMode === 'date' && selectedDate) {
        setTimeout(() => {
          setDatePickerMode('time');
          setShowDatePicker(true);
        }, 100);
      } else if (datePickerMode === 'time' && selectedDate) {
        // We've completed the time selection, ensure it's a future date
        const now = new Date();
        if (currentDate <= now) {
          Alert.alert("Invalid Date", "Please select a future date and time.");
          return;
        }
        
        setHiddenUntil(currentDate);
        setDatePickerMode('date'); // Reset for next time
      }
    } else {
      // For iOS, both date and time can be selected at once via the spinner
      if (selectedDate) {
        const now = new Date();
        if (selectedDate <= now) {
          Alert.alert("Invalid Date", "Please select a future date and time.");
          return;
        }
        
        setHiddenUntil(selectedDate);
      }
    }
  };

  const showDatePickerModal = () => {
    if (Platform.OS === 'android') {
      // On Android, we need to show date first, then time
      setDatePickerMode('date');
    }
    setShowDatePicker(true);
  };

  if (!location) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

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


        {isRecording && (
          <Text style={styles.durationText}>
            Recording: {formatDuration(duration)}
          </Text>
        )}

        {/* Range Selector */}
        <View style={styles.rangeContainer}>
  <Text style={styles.rangeLabel}>Range: {range} meters</Text>
  <View style={styles.rangeInputContainer}>
    <Text style={styles.rangeValue}>100m</Text>
    <TextInput
      style={styles.rangeInput}
      value={String(range)}
      onChangeText={(text) => {
        // Allow empty text when backspacing
        if (text === '') {
          setRange(0);
          return;
        }
        
        // Only process numeric input
        if (/^\d+$/.test(text)) {
          const value = parseInt(text);
          setRange(value);
        }
      }}
      onBlur={() => {
        // Validate the range only when user finishes editing
        if (range < 100) {
          setRange(100);
        } else if (range > 5000) {
          setRange(5000);
        }
      }}
      keyboardType="numeric"
      maxLength={4}
      placeholderTextColor="#888"
      placeholder="1000"
    />
    <Text style={styles.rangeValue}>5000m</Text>
  </View>
</View>
        {/* Date Time Selector */}
        <TouchableOpacity 
          style={styles.datePickerButton} 
          onPress={showDatePickerModal}
          disabled={isUploading}
        >
          <Calendar size={24} color="#fff" />
          <Text style={styles.dateText}>
            Hidden Until: {formatDate(hiddenUntil)}
          </Text>
        </TouchableOpacity>

        {/* Only show the date picker when showDatePicker is true */}
        {showDatePicker && (
          <DateTimePicker
            testID="dateTimePicker"
            value={hiddenUntil}
            mode={Platform.OS === 'ios' ? 'datetime' : datePickerMode}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onChangeDatePicker}
            minimumDate={new Date()}
            is24Hour={false}
          />
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
  datePickerButton: {
    backgroundColor: '#444',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
  },
  dateText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 10,
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
  loadingText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 100,
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
  rangeContainer: {
    marginTop: 15,
    backgroundColor: '#333',
    borderRadius: 8,
    padding: 15,
  },
  rangeLabel: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 10,
  },
  rangeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rangeInput: {
    backgroundColor: '#444',
    color: '#fff',
    padding: 10,
    borderRadius: 5,
    fontSize: 16,
    textAlign: 'center',
    width: '50%',
  },
  rangeValue: {
    color: '#999',
    fontSize: 14,
  },
});