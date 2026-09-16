import React, { useState } from 'react';
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

export default function ForgotPinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  
  const [email, setEmail] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  const handleRequestOtp = async () => {
    setErrorMsg('');
    if (!email) {
      setErrorMsg('Please enter your email address.');
      return;
    }

    try {
      const response = await fetch(`${HOST_URL}/auth/forgot-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.toLowerCase() })
      });

      const data = await response.json();
      if (!response.ok) {
        setErrorMsg(data.detail || 'Failed to request PIN reset.');
        return;
      }
      
      await SecureStore.setItemAsync('reset_email', email.toLowerCase());
      router.push('/auth/reset-pin');
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
          <Text style={styles.title}>Forgot PIN</Text>
          <Text style={styles.subtitle}>
            Enter your email to receive a 6-digit recovery code.
          </Text>

          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          <View style={styles.form}>
            <TextInput 
              style={styles.input} 
              placeholder="Email Address" 
              placeholderTextColor="#888"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            
            <TouchableOpacity style={styles.submitBtn} onPress={handleRequestOtp}>
              <Text style={styles.submitBtnText}>Send Code</Text>
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
  }
});
