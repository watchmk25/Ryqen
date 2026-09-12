import "react-native-url-polyfill/auto"
import { useEffect } from "react"
import { LogBox } from "react-native"
import { useAuthStore } from "./src/store/authStore"
import { supabase } from "./src/lib/supabase"
import { MainApp, LoginScreen } from "./src/screens"
import { configureNotificationHandler } from "./src/utils/notifications"

LogBox.ignoreLogs(['expo-notifications: Android Push notifications'])
configureNotificationHandler()

export default function App() {
  const { session, setSession, setLoading } = useAuthStore()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); setLoading(false) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSession(session))
    return () => subscription.unsubscribe()
  }, [])

  return session ? <MainApp /> : <LoginScreen />
}
