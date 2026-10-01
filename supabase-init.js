// supabase-init.js
// This file now assumes the Supabase CDN is loaded synchronously in the HTML <head>

const supabaseUrl = 'https://zaagtyzfexcjuzznamzk.supabase.co';
const supabaseKey = 'sb_publishable_ucZerIAE8uXdsrJJCy4UEw_qm89TKqt';

// Initialize synchronously. No more race conditions. No more undefined errors.
window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
