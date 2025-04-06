import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Modal, Alert, RefreshControl, FlatList, TextInput } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Bell, MapPin, User, Calendar, X, Mic, Trash2, UserPlus, UserCheck, UserX, Users, Search } from 'lucide-react-native';
import { useFocusEffect } from '@react-navigation/native';

interface UserProfile {
  username: string;
  email: string;
  notesCount: number;
  joinedDate: string;
  timeSinceJoining?: { value: number; label: string };
  followingCount?: number;
  followersCount?: number;
}

interface VoiceNote {
  _id: string;
  user_id: string;
  username: string;
  title?: string;
  file_name: string;
  location?: {
    coordinates?: [number, number];
  };
  hidden_until?: string;
  created_at: string;
  audio_data?: number;
}

interface FollowUser {
  id: string;
  username: string;
}

interface FollowRequest {
  id: string;
  username: string;
}

export default function ProfileScreen() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
  const [selectedNote, setSelectedNote] = useState<VoiceNote | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // Add to your existing state variables
  const [allUsers, setAllUsers] = useState<{id: string, username: string}[]>([]);
  const [searchResults, setSearchResults] = useState<{id: string, username: string}[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // Social feature states
  const [following, setFollowing] = useState<FollowUser[]>([]);
  const [followers, setFollowers] = useState<FollowUser[]>([]);
  const [pendingRequests, setPendingRequests] = useState<FollowRequest[]>([]);
  const [socialModalVisible, setSocialModalVisible] = useState(false);
  const [socialModalType, setSocialModalType] = useState<'following' | 'followers' | 'requests' | 'search'>('following');
  const [isRemovingFollower, setIsRemovingFollower] = useState(false);
  
  // Search functionality states
  const [usernameInput, setUsernameInput] = useState('');
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const usernameInputRef = useRef<TextInput>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      await loadProfile();
      await fetchVoiceNotes();
      await fetchFollowing();
      await fetchFollowers();
      await fetchPendingRequests();
      setError(null);
    } catch (err) {
      setError((err as Error).message || 'An error occurred');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial data load
  useEffect(() => {
    loadData();
  }, [loadData]);

  // Update profile when voice notes change
  useEffect(() => {
    if (profile && voiceNotes.length >= 0) {
      setProfile(prevProfile => ({
        ...prevProfile!,
        notesCount: voiceNotes.length
      }));
    }
  }, [voiceNotes]);

  // Update profile when followers change
  useEffect(() => {
    if (profile && followers.length >= 0) {
      setProfile(prevProfile => ({
        ...prevProfile!,
        followersCount: followers.length
      }));
    }
  }, [followers]);

  // Clear success message after a timeout
  useEffect(() => {
    if (requestSuccess) {
      const timer = setTimeout(() => {
        setRequestSuccess(null);
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [requestSuccess]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

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
        timeSinceJoining,
        followingCount: 0,  // Will be updated after fetching following
        followersCount: 0   // Will be updated after fetching followers
      };

      setProfile(userProfile);
      await AsyncStorage.setItem('userProfile', JSON.stringify(userProfile));
      return userProfile;
    } catch (err) {
      const errorMessage = (err as Error).message || 'Failed to load profile';
      throw new Error(errorMessage);
    }
  };
  
  const fetchAllUsers = async () => {
    try {
      setIsSearching(true);
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) throw new Error('No token found');
  
      const response = await fetch('https://echo-trails-backend.vercel.app/users/all', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
  
      if (!response.ok) throw new Error('Failed to fetch users');
  
      const data = await response.json();
      setAllUsers(data || []);
      
      // Initialize search results with all users
      setSearchResults(data || []);
      return data;
    } catch (err) {
      console.error('Error fetching users:', err);
      Alert.alert('Error', (err as Error).message || 'Failed to fetch users');
      return [];
    } finally {
      setIsSearching(false);
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

  // Social features implementation
  const fetchFollowing = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) throw new Error('No token found');
  
      const response = await fetch('https://echo-trails-backend.vercel.app/users/following', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
  
      if (!response.ok) throw new Error('Failed to fetch following users');
  
      const data = await response.json();
      setFollowing(data || []);
      
      // Add this line to update the followingCount in profile
      setProfile(prevProfile => ({
        ...prevProfile!,
        followingCount: data?.length || 0
      }));
      
      return data;
    } catch (err) {
      console.error('Error fetching following users:', err);
      throw err;
    }
  };

  // Add new function to fetch followers
  const fetchFollowers = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) throw new Error('No token found');
  
      const response = await fetch('https://echo-trails-backend.vercel.app/users/followers', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
  
      if (!response.ok) throw new Error('Failed to fetch followers');
  
      const data = await response.json();
      setFollowers(data || []);
      
      // Update the followersCount in profile
      setProfile(prevProfile => ({
        ...prevProfile!,
        followersCount: data?.length || 0
      }));
      
      return data;
    } catch (err) {
      console.error('Error fetching followers:', err);
      throw err;
    }
  };

  const fetchPendingRequests = async () => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) throw new Error('No token found');

      const response = await fetch('https://echo-trails-backend.vercel.app/users/follow/requests/pending', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) throw new Error('Failed to fetch pending requests');

      const data = await response.json();
      setPendingRequests(data || []);
      return data;
    } catch (err) {
      console.error('Error fetching pending requests:', err);
      throw err;
    }
  };

  const sendFollowRequest = async (username: string) => {
    if (!username.trim()) {
      Alert.alert('Error', 'Please enter a username');
      return false;
    }
    
    try {
      setIsSendingRequest(true);
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) throw new Error('No token found');

      const response = await fetch(`https://echo-trails-backend.vercel.app/users/follow/request/${username}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to send follow request');
      }
      
      // Show success message
      setRequestSuccess(`Follow request sent to ${username}`);
      
      // Clear input field
      setUsernameInput('');
      
      return true;
    } catch (err) {
      Alert.alert('Error', (err as Error).message || 'Failed to send follow request');
      return false;
    } finally {
      setIsSendingRequest(false);
    }
  };

  const acceptFollowRequest = async (requesterId: string) => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) throw new Error('No token found');

      const response = await fetch(`https://echo-trails-backend.vercel.app/users/follow/accept/${requesterId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to accept follow request');
      }
      
      // Remove from pending requests and refresh followers
      setPendingRequests(prevRequests => prevRequests.filter(req => req.id !== requesterId));
      fetchFollowers(); // Refresh the followers list
      
      Alert.alert('Success', 'Follow request accepted');
      return true;
    } catch (err) {
      Alert.alert('Error', (err as Error).message || 'Failed to accept follow request');
      return false;
    }
  };

  const rejectFollowRequest = async (requesterId: string) => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) throw new Error('No token found');

      const response = await fetch(`https://echo-trails-backend.vercel.app/users/follow/reject/${requesterId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to reject follow request');
      }
      
      // Remove from pending requests
      setPendingRequests(prevRequests => prevRequests.filter(req => req.id !== requesterId));
      
      Alert.alert('Success', 'Follow request rejected');
      return true;
    } catch (err) {
      Alert.alert('Error', (err as Error).message || 'Failed to reject follow request');
      return false;
    }
  };

  const unfollowUser = async (username: string) => {
    try {
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) throw new Error('No token found');
  
      const response = await fetch(`https://echo-trails-backend.vercel.app/users/unfollow/${username}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
  
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to unfollow user');
      }
  
      // Remove from following list
      setFollowing(prevFollowing => {
        const newFollowing = prevFollowing.filter(user => user.username !== username);
        
        // Update profile followingCount as well
        setProfile(prevProfile => ({
          ...prevProfile!,
          followingCount: newFollowing.length
        }));
        
        return newFollowing;
      });
      
      Alert.alert('Success', `Successfully unfollowed ${username}`);
      return true;
    } catch (err) {
      Alert.alert('Error', (err as Error).message || 'Failed to unfollow user');
      return false;
    }
  };

  const removeFollower = async (username: string) => {
    try {
      setIsRemovingFollower(true);
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) throw new Error('No token found');

      const response = await fetch(`https://echo-trails-backend.vercel.app/users/followers/remove/${username}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to remove follower');
      }

      // Remove from followers list
      setFollowers(prevFollowers => {
        const newFollowers = prevFollowers.filter(user => user.username !== username);
        
        // Update profile followersCount as well
        setProfile(prevProfile => ({
          ...prevProfile!,
          followersCount: newFollowers.length
        }));
        
        return newFollowers;
      });
      
      Alert.alert('Success', `Successfully removed ${username} from your followers`);
      return true;
    } catch (err) {
      Alert.alert('Error', (err as Error).message || 'Failed to remove follower');
      return false;
    } finally {
      setIsRemovingFollower(false);
    }
  };

  const openSocialModal = (type: 'following' | 'followers' | 'requests' | 'search') => {
    setSocialModalType(type);
    setSocialModalVisible(true);
    
    // Fetch all users when opening search modal
    if (type === 'search') {
      fetchAllUsers();
      setTimeout(() => {
        usernameInputRef.current?.focus();
      }, 300);
    }
  };

  const closeSocialModal = () => {
    setSocialModalVisible(false);
    // Clear search state when closing modal
    if (socialModalType === 'search') {
      setUsernameInput('');
      setRequestSuccess(null);
    }
  };

  // Handle submission of username for follow request
  const handleSendRequest = () => {
    if (usernameInput.trim()) {
      sendFollowRequest(usernameInput.trim());
    } else {
      Alert.alert('Error', 'Please enter a username');
    }
  };
  
  const searchUsers = (text: string) => {
    setUsernameInput(text);
    
    if (!text.trim()) {
      // If search text is empty, show all users
      setSearchResults(allUsers);
      return;
    }
    
    // Filter users whose username contains the search text
    const filtered = allUsers.filter(user => 
      user.username.toLowerCase().includes(text.toLowerCase())
    );
    setSearchResults(filtered);
  };

  // Existing voice note functions
  const deleteVoiceNote = async (audioId: string) => {
    try {
      setIsDeleting(true);
      const token = await AsyncStorage.getItem('accessToken');
      if (!token) throw new Error('No token found');

      const response = await fetch(`https://echo-trails-backend.vercel.app/audio/files/${audioId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete voice note');
      }

      // Remove the deleted note from state
      setVoiceNotes(prevNotes => prevNotes.filter(note => note._id !== audioId));
      
      // Close the modal after successful deletion
      closeModal();
      
      // Show success message
      Alert.alert('Success', 'Voice note deleted successfully');
      
      return true;
    } catch (err) {
      console.error('Error deleting voice note:', err);
      Alert.alert('Error', (err as Error).message || 'Failed to delete voice note');
      return false;
    } finally {
      setIsDeleting(false);
    }
  };

  const confirmDelete = () => {
    if (!selectedNote) return;
    
    Alert.alert(
      'Delete Voice Note',
      `Are you sure you want to delete "${selectedNote.title || selectedNote.file_name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: () => deleteVoiceNote(selectedNote._id)
        }
      ]
    );
  };

  const openNoteDetails = (note: VoiceNote) => {
    console.log("Opening note details:", note._id);
    // Safely log location data
    console.log("Location data:", note.location?.coordinates);
    setSelectedNote(note);
    console.log("Selected note:", note);
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

  const renderLoadingView = () => (
    <View style={styles.loadingContainer}>
      <Text style={styles.loadingText}>Loading...</Text>
    </View>
  );

  if (loading && !refreshing) {
    return renderLoadingView();
  }

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#00ff9d']}
          tintColor="#00ff9d"
        />
      }
    >
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={loadData}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.header}>

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
          
          <TouchableOpacity 
            style={styles.statItem}
            onPress={() => openSocialModal('following')}
          >
            <UserCheck size={24} color="#00ff9d" />
            <Text style={styles.statNumber}>{profile?.followingCount || 0}</Text>
            <Text style={styles.statLabel}>Following</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.statItem}
            onPress={() => openSocialModal('followers')}
          >
            <Users size={24} color="#00ff9d" />
            <Text style={styles.statNumber}>{profile?.followersCount || 0}</Text>
            <Text style={styles.statLabel}>Followers</Text>
          </TouchableOpacity>
        </View>

        {/* Find Users button */}
        <TouchableOpacity 
          style={styles.findUsersButton}
          onPress={() => openSocialModal('search')}
        >
          <View style={styles.findUsersButtonContent}>
            <Search size={20} color="#00ff9d" />
            <Text style={styles.findUsersButtonText}>Find Users</Text>
          </View>
        </TouchableOpacity>

        {/* Pending follow requests section */}
        {pendingRequests.length > 0 && (
          <TouchableOpacity 
            style={styles.requestsButton}
            onPress={() => openSocialModal('requests')}
          >
            <View style={styles.requestsButtonContent}>
              <UserPlus size={20} color="#00ff9d" />
              <Text style={styles.requestsButtonText}>
                {pendingRequests.length} Pending Follow {pendingRequests.length === 1 ? 'Request' : 'Requests'}
              </Text>
            </View>
          </TouchableOpacity>
        )}

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
                  {/* Display title if available, otherwise fallback to file_name */}
                  <Text style={styles.noteCardTitle} numberOfLines={1}>{note.title || 'Untitled'}</Text>
                  <Text style={styles.noteCardName} numberOfLines={1}>{note.file_name}</Text>
                  <Text style={styles.noteCardDate}>{new Date(note.created_at).toLocaleDateString()}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>

      {/* Voice Note Modal - Keep existing modal */}
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
                {/* Added title to the modal details */}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Title:</Text>
                  <Text style={styles.detailValue}>{selectedNote.title || 'Untitled'}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>By:</Text>
                  <Text style={styles.detailValue}>{selectedNote.username}</Text>
                </View>                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>File Name:</Text>
                  <Text style={styles.detailValue}>{selectedNote.file_name}</Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Hidden Until:</Text>
                  <Text style={styles.detailValue}>{formatDate(selectedNote.hidden_until)}</Text>
                </View>
                
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Location:</Text>
                  <Text style={styles.detailValue}>
                    {selectedNote.location?.coordinates ? 
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

                <TouchableOpacity 
                  style={styles.deleteButton} 
                  onPress={confirmDelete}
                  disabled={isDeleting}
                >
                  <Trash2 size={20} color="#fff" />
                  <Text style={styles.deleteButtonText}>
                    {isDeleting ? 'Deleting...' : 'Delete Voice Note'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Social Modal - Support for followers view */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={socialModalVisible}
        onRequestClose={closeSocialModal}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {socialModalType === 'following' ? 'Following' : 
                 socialModalType === 'followers' ? 'Followers' : 
                 socialModalType === 'requests' ? 'Pending Follow Requests' :
                 'Send Follow Request'}
              </Text>
              <TouchableOpacity onPress={closeSocialModal} style={styles.closeButton}>
                <X size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Direct follow request form - replaces search */}
            {socialModalType === 'search' && (
              <View style={styles.followRequestContainer}>
                <Text style={styles.followRequestLabel}>Search users to follow:</Text>
                <View style={styles.usernameInputContainer}>
                  <TextInput
                    ref={usernameInputRef}
                    style={styles.usernameInput}
                    placeholder="Search by username"
                    placeholderTextColor="#777"
                    value={usernameInput}
                    onChangeText={searchUsers}
                    returnKeyType="search"
                    autoCapitalize="none"
                  />
      {isSearching && (
        <View style={styles.searchingIndicator}>
          <Text style={styles.searchingText}>Loading...</Text>
        </View>
      )}
    </View>
    
    {requestSuccess && (
      <View style={styles.successContainer}>
        <Text style={styles.successText}>{requestSuccess}</Text>
      </View>
    )}
    
    <FlatList
  data={searchResults}
  keyExtractor={(item) => item.id}
  style={styles.searchResultsList} // Add this style
  contentContainerStyle={styles.searchResultsContent} // Add this style
  renderItem={({ item }) => (
    <View style={styles.userItem}>
      <View style={styles.userInfo}>
        <View style={styles.userAvatarPlaceholder}>
          <User size={24} color="#00ff9d" />
        </View>
        <Text style={styles.username} numberOfLines={1} ellipsizeMode="tail">
          {item.username}
        </Text>
      </View>
      
      <TouchableOpacity 
        style={styles.actionButton} 
        onPress={() => sendFollowRequest(item.username)}
        disabled={isSendingRequest}
      >
        <UserPlus size={18} color="#fff" />
        <Text style={styles.actionButtonText}>Follow</Text>
      </TouchableOpacity>
    </View>
  )}
  ListEmptyComponent={
    <Text style={styles.emptyText}>
      {isSearching ? 'Searching...' : 'No users found'}
    </Text>
  }
/>
</View>
)}
            
            {socialModalType !== 'search' && (
              <FlatList
                data={
                  socialModalType === 'following' ? following :
                  socialModalType === 'followers' ? followers :
                  pendingRequests
                }
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View style={styles.userItem}>
                    <View style={styles.userInfo}>
                      <View style={styles.userAvatarPlaceholder}>
                        <User size={24} color="#00ff9d" />
                      </View>
                      <Text style={styles.username}>{item.username}</Text>
                    </View>
                    
                    <View style={styles.userActions}>
                      {socialModalType === 'following' && (
                        <TouchableOpacity 
                          style={styles.actionButton} 
                          onPress={() => unfollowUser(item.username)}
                        >
                          <UserX size={18} color="#fff" />
                          <Text style={styles.actionButtonText}>Unfollow</Text>
                        </TouchableOpacity>
                      )}
                      
                      {socialModalType === 'followers' && (
                        <TouchableOpacity 
                          style={styles.actionButton} 
                          onPress={() => removeFollower(item.username)}
                        >
                          <UserX size={18} color="#fff" />
                          <Text style={styles.actionButtonText}>Remove</Text>
                        </TouchableOpacity>
                      )}
                      
                      {socialModalType === 'requests' && (
                        <View style={styles.requestActions}>
                          <TouchableOpacity 
                            style={[styles.actionButton, styles.acceptButton]} 
                            onPress={() => acceptFollowRequest(item.id)}
                          >
                            <UserCheck size={18} color="#fff" />
                            <Text style={styles.actionButtonText}>Accept</Text>
                          </TouchableOpacity>
                          
                          <TouchableOpacity 
                            style={[styles.actionButton, styles.rejectButton]} 
                            onPress={() => rejectFollowRequest(item.id)}
                          >
                            <UserX size={18} color="#fff" />
                            <Text style={styles.actionButtonText}>Reject</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  </View>
                )}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>
                    {socialModalType === 'following' ? 'Not following anyone yet' :
                     socialModalType === 'followers' ? 'No followers yet' :
                     'No pending follow requests'}
                  </Text>
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

// Add these new style definitions to your existing styles


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a1a',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#1a1a1a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    padding: 20,
    backgroundColor: 'rgba(255, 77, 77, 0.2)',
    borderRadius: 8,
    margin: 10,
    alignItems: 'center',
  },
  retryButton: {
    backgroundColor: '#00ff9d',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
    marginTop: 10,
  },
  retryButtonText: {
    color: '#1a1a1a',
    fontWeight: 'bold',
  },
  header: {
    height: 200,
    position: 'relative',
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
    marginBottom: 10,
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
  refreshButton: {
    backgroundColor: '#00ff9d',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  refreshButtonText: {
    color: '#1a1a1a',
    fontWeight: 'bold',
    fontSize: 12,
  },searchResultsList: {
    width: '100%',
    maxHeight: 300, // Limit height to ensure it stays in the modal
    flexGrow: 0,
  },
  searchResultsContent: {
    paddingBottom: 10,
    width: '100%',
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
  noteCardTitle: {
    color: '#00ff9d',
    fontSize: 16,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  noteCardName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'normal',
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
    maxHeight: '90%',
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
  deleteButton: {
    backgroundColor: '#ff4d4d',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    marginTop: 20,
  },
  deleteButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  // Social feature styles
  findUsersButton: {
    backgroundColor: '#2a2a2a',
    borderRadius: 8,
    padding: 12,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#00ff9d',
  },
  findUsersButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  findUsersButtonText: {
    color: '#00ff9d',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  requestsButton: {
    backgroundColor: 'rgba(0, 255, 157, 0.2)',
    borderRadius: 8,
    padding: 12,
    marginTop: 15,
    marginBottom: 15,
  },
  requestsButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestsButtonText: {
    color: '#00ff9d',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  userItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 255, 157, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  username: {
    color: '#fff',
    fontSize: 16,
  },
  userActions: {
    flexDirection: 'row',
  },
  actionButton: {
    backgroundColor: '#444',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  actionButtonText: {
    color: '#fff',
    marginLeft: 4,
    fontSize: 14,
  },
  requestActions: {
    flexDirection: 'row',
  },
  acceptButton: {
    backgroundColor: '#00ff9d',
    marginRight: 8,
  },
  rejectButton: {
    backgroundColor: '#ff4d4d',
  },
  // Search functionality styles
  searchContainer: {
    flexDirection: 'row',
    marginBottom: 15,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#333',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
    fontSize: 16,
  },
  searchButton: {
    backgroundColor: '#00ff9d',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchingIndicator: {
  position: 'absolute',
  right: 60,
  top: 10,
},
searchingText: {
  color: '#00ff9d',
  fontSize: 14,
},
  // Missing styles that are referenced in the component
  followRequestContainer: {
    padding: 10,
  },
  followRequestLabel: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 15,
  },
  usernameInputContainer: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  usernameInput: {
    flex: 1,
    backgroundColor: '#333',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginRight: 10,
    fontSize: 16,
  },
  sendRequestButton: {
    backgroundColor: '#00ff9d',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderRadius: 8,
  },
  sendRequestButtonText: {
    color: '#1a1a1a',
    fontWeight: 'bold',
    marginLeft: 5,
  },
  successContainer: {
    backgroundColor: 'rgba(0, 255, 157, 0.2)',
    padding: 10,
    borderRadius: 8,
    marginBottom: 15,
  },
  successText: {
    color: '#00ff9d',
    fontSize: 14,
    textAlign: 'center',
  },
  infoContainer: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#333',
    borderRadius: 8,
  },
  infoText: {
    color: '#aaa',
    fontSize: 14,
    textAlign: 'center',
  },
  // Additional potentially missing styles
  avatarContainer: {
    position: 'absolute',
    top: -50,
    alignSelf: 'center',
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#2a2a2a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#00ff9d',
  },
  avatar: {
    width: 90,
    height: 90,
    borderRadius: 45,
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  profileStats: {
    marginTop: 20,
  },
  joinedInfo: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  joinedText: {
    color: '#888',
    fontSize: 14,
  },
  durationText: {
    color: '#00ff9d',
    fontWeight: 'bold',
    fontSize: 14,
    marginLeft: 5,
  }
});