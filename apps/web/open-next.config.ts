import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * Keep adapter configuration deliberately small until Workers preview has
 * been exercised in Linux CI/WSL. Supabase remains the application backend;
 * this file only selects the OpenNext Cloudflare adapter defaults.
 */
export default defineCloudflareConfig();
