#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const branding=path.join(root,'ops/chatwoot/branding');

function once(text,from,to,label){
  const first=text.indexOf(from);
  if(first<0) throw new Error('[chatwoot-branding] missing upstream fragment: '+label);
  if(text.indexOf(from,first+from.length)>=0) throw new Error('[chatwoot-branding] non-unique upstream fragment: '+label);
  return text.slice(0,first)+to+text.slice(first+from.length);
}
function patch(file,replacements){
  let text=fs.readFileSync(file,'utf8');
  for(const [label,from,to] of replacements) text=once(text,from,to,label);
  fs.writeFileSync(file,text);
}
export function applyBrandingOverlay(upstream){
  const dir=path.resolve(upstream);
  fs.mkdirSync(path.join(dir,'public/brand-assets'),{recursive:true});
  fs.mkdirSync(path.join(dir,'app/javascript/v3/styles'),{recursive:true});
  for(const [src,dst] of [
    ['logo.svg','smartvisions-logo.svg'],
    ['logo_dark.svg','smartvisions-logo-dark.svg'],
    ['logo_thumbnail.svg','smartvisions-logo-thumbnail.svg']
  ]) fs.copyFileSync(path.join(branding,src),path.join(dir,'public/brand-assets',dst));
  fs.copyFileSync(path.join(branding,'smartvisions-auth.css'),path.join(dir,'app/javascript/v3/styles/smartvisions-auth.css'));

  patch(path.join(dir,'app/javascript/v3/views/login/Index.vue'),[
    ['login css',"import { SESSION_EVENTS } from 'dashboard/helper/AnalyticsHelper/events';","import { SESSION_EVENTS } from 'dashboard/helper/AnalyticsHelper/events';\nimport '../../styles/smartvisions-auth.css';"],
    ['login shell','class="flex flex-col w-full min-h-screen py-20 bg-n-brand/5 dark:bg-n-background sm:px-6 lg:px-8"','class="sv-auth-shell flex flex-col w-full min-h-screen py-12 sm:py-16 sm:px-6 lg:px-8"'],
    ['login header','<section class="max-w-5xl mx-auto">','<section class="sv-auth-header max-w-5xl mx-auto">'],
    ['login logo','class="block w-auto h-8 mx-auto dark:hidden"','class="sv-auth-logo block w-auto mx-auto dark:hidden"'],
    ['login dark logo','class="hidden w-auto h-8 mx-auto dark:block"','class="sv-auth-logo hidden w-auto mx-auto dark:block"'],
    ['login title','class="mt-6 text-3xl font-medium text-center text-n-slate-12"','class="sv-auth-title mt-6 text-3xl font-medium text-center text-n-slate-12"'],
    ['login card','class="bg-white shadow sm:mx-auto mt-11 sm:w-full sm:max-w-lg dark:bg-n-solid-2 p-11 sm:shadow-lg sm:rounded-lg"','class="sv-auth-card sm:mx-auto mt-11 sm:w-full sm:max-w-lg p-11"'],
    ['login button','class="w-full"\n            :tabindex="3"','class="w-full sv-auth-submit"\n            :tabindex="3"']
  ]);

  patch(path.join(dir,'app/javascript/v3/views/auth/reset/password/Index.vue'),[
    ['forgot vuex',"import { useVuelidate } from '@vuelidate/core';","import { mapGetters } from 'vuex';\nimport { useVuelidate } from '@vuelidate/core';"],
    ['forgot css',"import NextButton from 'dashboard/components-next/button/Button.vue';","import NextButton from 'dashboard/components-next/button/Button.vue';\nimport '../../../../styles/smartvisions-auth.css';"],
    ['forgot config','  methods: {',"  computed: {\n    ...mapGetters({ globalConfig: 'globalConfig/get' }),\n  },\n  methods: {"],
    ['forgot shell','class="flex flex-col justify-center w-full min-h-screen py-12 bg-n-brand/5 dark:bg-n-background sm:px-6 lg:px-8"','class="sv-auth-shell flex flex-col justify-center w-full min-h-screen py-12 sm:px-6 lg:px-8"'],
    ['forgot header','  >\n    <form','  >\n    <section class="sv-auth-header max-w-5xl mx-auto mb-6">\n      <img :src="globalConfig.logo" :alt="globalConfig.installationName" class="sv-auth-logo block w-auto mx-auto dark:hidden" />\n      <img v-if="globalConfig.logoDark" :src="globalConfig.logoDark" :alt="globalConfig.installationName" class="sv-auth-logo hidden w-auto mx-auto dark:block" />\n    </section>\n    <form'],
    ['forgot card','class="bg-white shadow sm:mx-auto sm:w-full sm:max-w-lg dark:bg-n-solid-2 p-11 sm:shadow-lg sm:rounded-lg"','class="sv-auth-card sm:mx-auto sm:w-full sm:max-w-lg p-11"'],
    ['forgot button','class="w-full"\n          :label="$t(\'RESET_PASSWORD.SUBMIT\')"','class="w-full sv-auth-submit"\n          :label="$t(\'RESET_PASSWORD.SUBMIT\')"']
  ]);

  patch(path.join(dir,'app/javascript/v3/views/auth/password/Edit.vue'),[
    ['reset vuex',"import { useVuelidate } from '@vuelidate/core';","import { mapGetters } from 'vuex';\nimport { useVuelidate } from '@vuelidate/core';"],
    ['reset css',"import { setNewPassword } from '../../../api/auth';","import { setNewPassword } from '../../../api/auth';\nimport '../../../styles/smartvisions-auth.css';"],
    ['reset config','  data() {',"  computed: {\n    ...mapGetters({ globalConfig: 'globalConfig/get' }),\n  },\n  data() {"],
    ['reset shell','class="flex flex-col justify-center w-full min-h-screen py-12 bg-n-brand/5 dark:bg-n-background sm:px-6 lg:px-8"','class="sv-auth-shell flex flex-col justify-center w-full min-h-screen py-12 sm:px-6 lg:px-8"'],
    ['reset header','  >\n    <form','  >\n    <section class="sv-auth-header max-w-5xl mx-auto mb-6">\n      <img :src="globalConfig.logo" :alt="globalConfig.installationName" class="sv-auth-logo block w-auto mx-auto dark:hidden" />\n      <img v-if="globalConfig.logoDark" :src="globalConfig.logoDark" :alt="globalConfig.installationName" class="sv-auth-logo hidden w-auto mx-auto dark:block" />\n    </section>\n    <form'],
    ['reset card','class="bg-white shadow sm:mx-auto sm:w-full sm:max-w-lg dark:bg-n-solid-2 p-11 sm:shadow-lg sm:rounded-lg"','class="sv-auth-card sm:mx-auto sm:w-full sm:max-w-lg p-11"'],
    ['reset button','class="w-full"\n          :label="$t(\'SET_NEW_PASSWORD.SUBMIT\')"','class="w-full sv-auth-submit"\n          :label="$t(\'SET_NEW_PASSWORD.SUBMIT\')"']
  ]);

  patch(path.join(dir,'app/javascript/dashboard/routes/dashboard/onboarding/account-details/OnboardingFormRow.vue'),[
    ['onboarding row mobile grid',
      'class="grid grid-cols-2 items-center px-3 py-3 border-t border-n-weak"',
      'class="grid grid-cols-1 gap-2 px-3 py-3 border-t border-n-weak sm:grid-cols-2 sm:items-center"'],
    ['onboarding row label wrapper',
      'class="flex items-center gap-2"',
      'class="flex min-w-0 items-center gap-2"'],
    ['onboarding row label text',
      'class="text-n-slate-11"',
      'class="min-w-0 break-words text-n-slate-11"']
  ]);

  patch(path.join(dir,'app/javascript/dashboard/routes/dashboard/onboarding/account-details/OnboardingFormSelect.vue'),[
    ['onboarding select wrapper',
      'class="relative flex items-center justify-end"',
      'class="relative flex w-full min-w-0 items-center justify-start sm:justify-end"'],
    ['onboarding select responsive width',
      'class="!h-auto !w-auto !py-0 !ps-0 !pe-[17px] !m-0 !rounded-none !bg-transparent !bg-none !outline-none text-sm text-end border-0 cursor-pointer appearance-none focus:outline-none focus:ring-0"',
      'class="!h-auto !w-full sm:!w-auto !max-w-full !py-0 !ps-0 !pe-[17px] !m-0 !rounded-none !bg-transparent !bg-none !outline-none text-sm text-start sm:text-end border-0 cursor-pointer appearance-none focus:outline-none focus:ring-0"']
  ]);
  console.log(JSON.stringify({ok:true,overlay:'smartvisions-branding-v1'}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  if(!process.argv[2]) throw new Error('Chatwoot upstream directory is required');
  applyBrandingOverlay(process.argv[2]);
}
