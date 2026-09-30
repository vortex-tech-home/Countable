// supabase-init.js
// This file now assumes the Supabase CDN is loaded synchronously in the HTML <head>

const supabaseUrl = 'https://rgwuqnmgphyjwioixgcu.supabase.co';
const supabaseKey = 'sb_publishable_vSHVnLeJEjrnVGvlb7WuZA_TIzFbLKA';

// Initialize synchronously. No more race conditions. No more undefined errors.
window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
