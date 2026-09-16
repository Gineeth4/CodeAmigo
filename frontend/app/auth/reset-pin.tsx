import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView 
} from 'react-native';
import { useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const HOST_URL = Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000';

export default function ResetPinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const loadEmail = async () => {
      const savedEmail = await SecureStore.getItemAsync('reset_email');
      if (savedEmail) {
        setEmail(savedEmail);
      }
    };
    loadEmail();
  }, []);

  const handleReset = async () => {
    setErrorMsg('');
    if (!otp || !newPin || !confirmPin) {
      setErrorMsg('Please fill all fields.');
      return;
    }
    if (newPin !== confirmPin) {
      setErrorMsg('New PINs do not match.');
      return;
    }
    if (newPin.length !== 6 || isNaN(Number(newPin))) {
      setErrorMsg('PIN must be exactly 6 digits.');
      return;
    }

    try {
      const response = await fetch(`${HOST_URL}/auth/reset-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          email: email, 
          otp: otp,
          new_pin: newPin
        })
      });

      const data = await response.json();
      if (!response.ok) {
        setErrorMsg(data.detail || 'Failed to reset PIN.');
        return;
      }
      
      setSuccessMsg('PIN successfully reset! Redirecting to login...');
      setTimeout(() => {
        router.push('/signup');
      }, 2000);

    } catch (e) {
      setErrorMsg('Network error connecting to backend.');
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView 
        style={{ flex: 1, backgroundColor: '#161B22' }} 
        contentContainerStyle={{ 
          flexGrow: 1, 
          paddingTop: insets.top + 40,
          paddingBottom: 20 
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 20 }}>
          <Text style={styles.title}>Reset PIN</Text>
          <Text style={styles.subtitle}>
            Enter the 6-digit code sent to {email} and your new PIN.
          </Text>

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
          {successMsg ? <Text style={styles.successText}>{successMsg}</Text> : null}

          <View style={styles.form}>
            <TextInput 
              style={styles.input} 
              placeholder="6-digit recovery code" 
              placeholderTextColor="#888"
              value={otp}
              onChangeText={setOtp}
              keyboardType="numeric"
              maxLength={6}
            />
            <TextInput 
              style={styles.input} 
              placeholder="New 6-digit PIN" 
              placeholderTextColor="#888"
              value={newPin}
              onChangeText={setNewPin}
              keyboardType="numeric"
              maxLength={6}
              secureTextEntry
            />
            <TextInput 
              style={styles.input} 
              placeholder="Confirm new PIN" 
              placeholderTextColor="#888"
              value={confirmPin}
              onChangeText={setConfirmPin}
              keyboardType="numeric"
              maxLength={6}
              secureTextEntry
            />
            
            <TouchableOpacity style={styles.submitBtn} onPress={handleReset}>
              <Text style={styles.submitBtnText}>Reset PIN</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.backBtn} onPress={() => router.push('/signup')}>
              <Text style={styles.backBtnText}>Back to Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#121212' },
  title: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    color: '#AAA',
    fontSize: 16,
    marginBottom: 30,
    textAlign: 'center',
  },
  form: { width: '100%' },
  input: {
    backgroundColor: '#1E1E1E',
    color: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 16,
  },
  submitBtn: {
    backgroundColor: '#0A84FF',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  backBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 10,
  },
  backBtnText: {
    color: '#888',
    fontSize: 14,
  },
  errorText: {
    color: '#FF453A',
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 14,
  },
  successText: {
    color: '#34C759',
    marginBottom: 16,
    textAlign: 'center',
    fontSize: 14,
  }
});
