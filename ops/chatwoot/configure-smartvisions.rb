# Smart Visions Community-safe installation baseline.
# Run after db:chatwoot_prepare for each new environment/release.
#
# This file changes installation configuration only. It does not enable
# Chatwoot Enterprise features, provider channels, campaigns or AI.

values = {
  'INSTALLATION_NAME' => 'Smart Visions Inbox',
  'BRAND_NAME' => 'Smart Visions',
  'BRAND_URL' => 'https://smartvisionsai.com',
  'WIDGET_BRAND_URL' => 'https://smartvisionsai.com',
  'DISPLAY_MANIFEST' => false,
  'ENABLE_ACCOUNT_SIGNUP' => false,
  'CREATE_NEW_ACCOUNT_FROM_DASHBOARD' => false
}.freeze

values.each do |name, value|
  config = InstallationConfig.find_or_initialize_by(name: name)
  config.value = value
  config.save!
end

puts "Smart Visions Chatwoot installation baseline applied: #{values.keys.sort.join(', ')}"
