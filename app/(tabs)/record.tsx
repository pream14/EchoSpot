import React, { useEffect, useState, useRef } from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  TextInput,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  FlatList,
  Modal,
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
  Calendar,
  Users,
  X,
  CheckCircle,
} from "lucide-react-native";
import MapLibreGL, { MapViewRef, CameraRef } from '@maplibre/maplibre-react-native';
import * as DocumentPicker from "expo-document-picker";
import DateTimePicker from '@react-native-community/datetimepicker';

// Import the upload service
import { uploadAudioFile } from "./audioUploadService";
import { getFollowingUsers } from "./userService"; // You'll need to create this service

const MAX_DURATION = 60000; // 60 seconds

type Note = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  range: number;
  hidden_until: Date;
};

type FollowingUser = {
  id: string;
  username: string;
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
  const [hiddenUntil, setHiddenUntil] = useState(new Date(Date.now()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [datePickerMode, setDatePickerMode] = useState<'date' | 'time'>('date');
  const [range, setRange] = useState(1000);
  
  // New states for friend selection
  const [followingUsers, setFollowingUsers] = useState<FollowingUser[]>([]);
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [showFriendsModal, setShowFriendsModal] = useState(false);
  const [username, setUsername] = useState<string>("");
  
  const timerRef = useRef<NodeJS.Timeout>();
  const mapRef = useRef<MapViewRef>(null);
  const cameraRef = useRef<CameraRef>(null);

  useEffect(() => {
    (async () => {
      // Get location permissions
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation);
      
      // Load current username from AsyncStorage
      try {
        const storedUsername = await AsyncStorage.getItem("userName");
        if (storedUsername) {
          setUsername(storedUsername);
        }
      } catch (error) {
        console.error("Error loading username:", error);
      }
      
      // Load following users
      fetchFollowingUsers();
    })();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (recording) recording.stopAndUnloadAsync();
    };
  }, []);
  
  // Fetch the user's following list
  const fetchFollowingUsers = async () => {
    try {
      // Get auth token from AsyncStorage
      const token = await AsyncStorage.getItem("accessToken");
      if (!token) {
        console.error("No auth token found");
        return;
      }
      
      const users = await getFollowingUsers(token);
      setFollowingUsers(users);
    } catch (error) {
      console.error("Failed to fetch following users:", error);
    }
  };

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
      // Validate title is provided
      if (!title.trim()) {
        Alert.alert("Error", "Please enter a title for your voice note.");
        return;
      }
      
      setIsUploading(true);

      let noteLocation = customLocation || location?.coords;
      if (!noteLocation) {
        Alert.alert("Error", "No valid location available.");
        setIsUploading(false);
        return;
      }
      
      // Create recipient list - if no friends selected, include current user
      let recipients = selectedFriends.length > 0 ? [...selectedFriends] : [];
      // Always include current user if they have a username
      if (username && !recipients.includes(username)) {
        recipients.push(username);
      }
      
      // Join recipients into comma-separated string
      const recipientString = recipients.join(',');

      // Upload the audio file with all parameters
      const uploadResult = await uploadAudioFile({
        audioUri: recordingUri,
        title: title.trim(),
        latitude: noteLocation.latitude,
        longitude: noteLocation.longitude,
        range: range,
        hiddenUntil: hiddenUntil,
        recipient_usernames: recipientString // Add the recipient usernames
      });
      console.log(uploadResult);
      
      // Create a new note with the server-generated ID
      const newNote: Note = {
        id: uploadResult.id,
        title: title.trim(),
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
      setHiddenUntil(new Date(Date.now()));
      setRange(1000);
      setSelectedFriends([]);

      // Show success message
      Alert.alert("Success", "Voice note uploaded successfully");
    } catch (error) {
      console.error("Failed to save voice note:", error);
      Alert.alert("Error", "Failed to upload voice note. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  const handleMapPress = (event: any) => {
    const coordinates = event.geometry.coordinates;
    setCustomLocation({
      latitude: coordinates[1],
      longitude: coordinates[0]
    });
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
    // Handle cancelled selection
    if (!selectedDate) {
      setShowDatePicker(false);
      return;
    }
    
    const currentDate = selectedDate;
    
    if (Platform.OS === 'android') {
      setShowDatePicker(false);
      
      // If we're in date mode and a valid date was selected, 
      // switch to time mode after selecting the date (Android only)
      if (datePickerMode === 'date') {
        // Copy the selected date's date part to the existing hiddenUntil value
        const newDate = new Date(hiddenUntil);
        newDate.setFullYear(currentDate.getFullYear());
        newDate.setMonth(currentDate.getMonth());
        newDate.setDate(currentDate.getDate());
        
        setHiddenUntil(newDate);
        
        // Now show the time picker
        setTimeout(() => {
          setDatePickerMode('time');
          setShowDatePicker(true);
        }, 100);
      } else if (datePickerMode === 'time') {
        // Copy the selected time to the existing hiddenUntil value
        const newDate = new Date(hiddenUntil);
        newDate.setHours(currentDate.getHours());
        newDate.setMinutes(currentDate.getMinutes());
        
        // Ensure it's a future date
        const now = new Date();
        if (newDate <= now) {
          Alert.alert("Invalid Date", "Please select a future date and time.");
          return;
        }
        
        setHiddenUntil(newDate);
        setDatePickerMode('date'); // Reset for next time
      }
    } else {
      // For iOS, both date and time are selected at once
      // Ensure it's a future date
      const now = new Date();
      if (currentDate <= now) {
        Alert.alert("Invalid Date", "Please select a future date and time.");
        return;
      }
      
      setHiddenUntil(currentDate);
      setShowDatePicker(false);
    }
  };
  
  const showDatePickerModal = () => {
    if (Platform.OS === 'android') {
      // On Android, we need to show date first, then time
      setDatePickerMode('date');
    }
    setShowDatePicker(true);
  };
  
  // Friend selection functions
  const toggleFriendSelection = (username: string) => {
    if (selectedFriends.includes(username)) {
      setSelectedFriends(selectedFriends.filter(friend => friend !== username));
    } else {
      setSelectedFriends([...selectedFriends, username]);
    }
  };
  
  const renderFriendItem = ({ item }: { item: FollowingUser }) => (
    <TouchableOpacity
      style={[
        styles.friendItem,
        selectedFriends.includes(item.username) && styles.selectedFriendItem
      ]}
      onPress={() => toggleFriendSelection(item.username)}
    >
      <Text style={styles.friendUsername}>{item.username}</Text>
      {selectedFriends.includes(item.username) && (
        <CheckCircle size={20} color="#00ff9d" />
      )}
    </TouchableOpacity>
  );

  if (!location) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        {location && (
          <MapLibreGL.MapView
            ref={mapRef}
            style={styles.map}
            mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
            onPress={handleMapPress}
          >
            <MapLibreGL.Camera
              ref={cameraRef}
              defaultSettings={{
                centerCoordinate: [location.coords.longitude, location.coords.latitude],
                zoomLevel: 14
              }}
            />
            
            {/* Current location marker */}
            <MapLibreGL.PointAnnotation
              id="currentLocation"
              coordinate={[location.coords.longitude, location.coords.latitude]}
            >
              <View style={styles.marker}>
                <MapPin size={20} color="#fff" />
              </View>
            </MapLibreGL.PointAnnotation>

            {/* Custom location marker */}
            {customLocation && (
              <MapLibreGL.PointAnnotation
                id="customLocation"
                coordinate={[customLocation.longitude, customLocation.latitude]}
              >
                <View style={[styles.marker, styles.customMarker]}>
                  <MapPin size={20} color="#fff" />
                </View>
              </MapLibreGL.PointAnnotation>
            )}
          </MapLibreGL.MapView>
        )}

        <View style={styles.controls}>
          {/* Title Input Field */}
          <TextInput
            style={styles.input}
            placeholder="Enter a title for your voice note"
            placeholderTextColor="#888"
            value={title}
            onChangeText={setTitle}
            editable={!isUploading}
          />

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
                editable={!isUploading}
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
          
          {/* Friend Selection Button */}
          <TouchableOpacity 
            style={styles.friendsButton} 
            onPress={() => setShowFriendsModal(true)}
            disabled={isUploading}
          >
            <Users size={24} color="#fff" />
            <Text style={styles.friendsButtonText}>
              {selectedFriends.length > 0 
                ? `Send to ${selectedFriends.length} friend${selectedFriends.length === 1 ? '' : 's'}` 
                : "Share with friends"}
            </Text>
          </TouchableOpacity>

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
                  disabled={isUploading || isPlaying}
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
          
          {/* Add extra space at the bottom to ensure everything is accessible */}
          <View style={styles.bottomSpacer} />
        </View>
      </ScrollView>
      
      {/* Friends Selection Modal */}
      <Modal
        visible={showFriendsModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowFriendsModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Friends</Text>
              <TouchableOpacity onPress={() => setShowFriendsModal(false)}>
                <X size={24} color="#fff" />
              </TouchableOpacity>
            </View>
            
            {followingUsers.length > 0 ? (
              <FlatList
                data={followingUsers}
                renderItem={renderFriendItem}
                keyExtractor={(item) => item.id}
                style={styles.friendsList}
              />
            ) : (
              <Text style={styles.noFriendsText}>No friends found</Text>
            )}
            
            <TouchableOpacity 
              style={styles.doneButton}
              onPress={() => setShowFriendsModal(false)}
            >
              <Text style={styles.doneButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  scrollContainer: {
    flexGrow: 1,
  },
  map: {
    width: '100%',
    height: 400,
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
    padding: 20,
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
    marginBottom: 10,
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
    marginVertical: 20,
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
  bottomSpacer: {
    height: Platform.OS === 'ios' ? 50 : 20,
  },
  // Friend selection styles
  friendsButton: {
    backgroundColor: '#4a6fa5',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 15,
  },
  friendsButtonText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 10,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#222',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  friendsList: {
    maxHeight: 350,
  },
  friendItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 15,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  selectedFriendItem: {
    backgroundColor: 'rgba(0, 255, 157, 0.1)',
  },
  friendUsername: {
    color: '#fff',
    fontSize: 16,
  },
  noFriendsText: {
    color: '#ccc',
    fontSize: 16,
    textAlign: 'center',
    padding: 20,
  },
  doneButton: {
    backgroundColor: '#00ff9d',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 20,
  },
  doneButtonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
});