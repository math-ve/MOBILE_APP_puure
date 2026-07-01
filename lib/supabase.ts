import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import 'react-native-url-polyfill/auto'

const supabaseUrl = 'https://vwlqdrrlggolgdssdwoh.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3bHFkcnJsZ2dvbGdkc3Nkd29oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2ODkyNjIsImV4cCI6MjA5NTI2NTI2Mn0.859w5rLfcdZWG_vhk0tQM0cqcwRluIFlHjLIsM3Sr5o'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
