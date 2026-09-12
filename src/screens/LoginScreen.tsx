import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native'
import { signIn, signUp } from '../lib/supabase'
import { C, T, d } from '../constants'

export function LoginScreen() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)

  async function handleAuth() {
    if (!email || !password) { Alert.alert("Missing fields", "Please enter your email and password."); return }
    setLoading(true)
    try {
      if (isSignUp) { await signUp(email, password); Alert.alert("Check your email", "A confirmation link has been sent.") }
      else { await signIn(email, password) }
    } catch (e: any) { Alert.alert("Error", e.message) }
    finally { setLoading(false) }
  }

  return (
    <View style={d.authContainer}>
      <View style={d.authTop}>
        <Text style={d.authLogo}>RYQEN</Text>
        <Text style={[T.footnote, { textAlign: 'center', marginTop: 8 }]}>
          {isSignUp ? "Begin your awakening." : "Welcome back, Hunter."}
        </Text>
      </View>
      <View style={d.authForm}>
        <TextInput
          style={d.authInput}
          value={email}
          onChangeText={setEmail}
          placeholder="Email"
          placeholderTextColor={C.t3}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextInput
          style={d.authInput}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={C.t3}
          secureTextEntry
        />
        <TouchableOpacity style={d.authBtn} onPress={handleAuth} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={d.authBtnText}>{isSignUp ? "Create Account" : "Sign In"}</Text>
          }
        </TouchableOpacity>
        <TouchableOpacity style={d.authSwitch} onPress={() => setIsSignUp(!isSignUp)}>
          <Text style={T.footnote}>
            {isSignUp ? "Already have an account? " : "New to Ryqen? "}
            <Text style={{ color: C.accent }}>{isSignUp ? "Sign In" : "Create Account"}</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
