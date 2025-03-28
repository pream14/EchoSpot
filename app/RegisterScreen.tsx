import { useState } from "react";
import { View, TextInput, Button, Text, TouchableOpacity, StyleSheet ,Alert} from "react-native"; // ✅ Add missing imports
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";

export default function RegisterScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setusername] = useState("");
  const router = useRouter();


  const handleRegister = async () => {
    try {
      const response = await fetch("https://echo-trails-backend.vercel.app/users/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ username, email, password }),
      });

      if (!response.ok) {
        throw new Error("Registration failed");
      }

      const data = await response.json();
      console.log(data);
      // Save user data in AsyncStorage

      // Redirect to main app
      router.replace("/LoginScreen");
    } catch (error) {
      Alert.alert("Error", (error as Error).message);
    }
  };
  

 return (
    <View style={styles.container}>
      <Text style={styles.title}>Register</Text>

      <TextInput
        style={styles.input}
        placeholder="User Name"
        placeholderTextColor="#aaa"
        value={username} // Use state variable
        onChangeText={setusername} // Updates state on text change
      />
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#aaa"
        value={email}
        onChangeText={setEmail}
      />

      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor="#aaa"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleRegister}>
        <Text style={styles.buttonText}>Register</Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => router.push("/LoginScreen")}>
        <Text style={styles.linkText}>Already Registered</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#121212", // Dark mode background
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  title: {
    fontSize: 24,
    color: "#fff",
    marginBottom: 20,
    fontWeight: "bold",
  },
  input: {
    width: "100%",
    height: 50,
    backgroundColor: "#1e1e1e",
    color: "#fff",
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#333",
  },
  button: {
    width: "100%",
    height: 50,
    backgroundColor: "#00ff9d",
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
    marginBottom: 15,
  },
  buttonText: {
    color: "#121212",
    fontSize: 18,
    fontWeight: "bold",
  },
  linkText: {
    color: "#00ff9d",
    fontSize: 16,
  },
});
