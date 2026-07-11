/**
 * Lightweight i18n. Dependency-free catalogs + a `t()` helper with {var}
 * interpolation. The effective language is the user's choice, or the phone's
 * language when set to "system" (Swedish phones get Swedish automatically).
 *
 * Coverage is being migrated incrementally; any missing key falls back to
 * English, then to the key itself, so the app never shows a blank.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Lang = 'en' | 'sv';
export type LangPref = 'system' | Lang;

const en: Record<string, string> = {
  'common.cancel': 'Cancel',
  'common.done': 'Done',
  'common.save': 'Save',
  'common.next': 'Next',
  'common.skip': 'Skip',
  'common.getStarted': 'Get started',
  'common.loading': 'Loading…',

  'tabs.messages': 'Messages',
  'tabs.assistant': 'Assistant',
  'tabs.settings': 'Settings',

  'onboarding.welcome.title': 'Welcome to Kinly',
  'onboarding.welcome.body': 'A simple, private way to stay close to your family and friends.',
  'onboarding.readable.title': 'Big and easy to read',
  'onboarding.readable.body': 'Everything is large and clear. You can make the text even bigger in Settings → Display.',
  'onboarding.assistant.title': 'Just ask',
  'onboarding.assistant.body': 'Tap the ✨ Assistant button and say what you want — like "Call Mary" or "Tell Tom I\'ll be late".',
  'onboarding.private.title': 'Private by default',
  'onboarding.private.body': 'Your messages are end-to-end encrypted. Only you and your family can read them — not even we can.',

  'auth.welcome': 'Welcome to Kinly',
  'auth.signinSub': 'Sign in to talk with your family.',
  'auth.signupSub': 'Create your account to get started.',
  'auth.name': 'Your name',
  'auth.phone': 'Phone number',
  'auth.phoneHint': 'Family add you by your phone number.',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.passwordHint': 'At least 8 characters',
  'auth.signin': 'Sign in',
  'auth.createAccount': 'Create account',
  'auth.forgot': 'Forgot password?',
  'auth.toSignup': 'New here? Create an account',
  'auth.toSignin': 'Already have an account? Sign in',

  'messages.search': 'Search messages and people',
  'messages.noChats': 'No chats yet',
  'messages.noChatsBody': 'Add a family member or friend by their phone number to start talking.',
  'messages.addPerson': 'Add a person',
  'messages.newGroup': 'New group',
  'messages.joinGroup': 'Join a group',
  'messages.addTitle': 'Add',
  'messages.addPrompt': 'What would you like to do?',
  'messages.allChats': 'Show all chats',
  'messages.backToSimple': 'Back to simple view',
  'messages.getHelp': 'Get help — call {name}',
  'messages.people': 'People',
  'messages.messages': 'Messages',
  'messages.noMatches': 'No matches. Try a different word.',

  'settings.member': 'Kinly member',
  'settings.you': 'You',
  'settings.editProfile': 'Edit profile',
  'settings.connection': 'Connection',
  'settings.connected': 'Connected',
  'settings.onThisDevice': 'On this device',
  'settings.readAloud': 'Read messages aloud',
  'settings.readAloudValue': 'On — tap the speaker on any message',
  'settings.display': 'Display',
  'settings.displayValue': 'Text size & dark mode',
  'settings.appLock': 'App lock',
  'settings.appLockUnavailable': 'Not available on this device',
  'settings.appLockOn': 'On — Face ID / fingerprint / passcode',
  'settings.appLockOff': 'Off — tap to require unlock',
  'settings.encryption': 'Encryption',
  'settings.encryptionValue': 'Recovery phrase & keys',
  'settings.emergency': 'Emergency contact',
  'settings.emergencyNotSet': 'Not set — tap to choose',
  'settings.checkin': 'Daily check-in',
  'settings.checkinValue': 'Let your family know you’re OK',
  'settings.language': 'Language',
  'settings.help': 'Help',
  'settings.about': 'About Kinly',
  'settings.version': 'Version {version}',
  'settings.signOut': 'Sign out',
  'settings.signOutConfirm': 'Are you sure you want to sign out?',

  'chat.writeMessage': 'Write a message…',
  'chat.photos': 'Photos',
  'chat.pin': 'Pin',
  'chat.unpin': 'Unpin',
  'chat.pinned': 'Pinned message',
  'chat.save': 'Save message',
  'chat.unsave': 'Remove from saved',
  'chat.forward': 'Forward',
  'chat.forwardTo': 'Forward to…',
  'chat.search': 'Search this chat',
  'chat.searchPlaceholder': 'Search in this conversation',
  'chat.noResults': 'No messages match your search.',
  'chat.typingOne': '{name} is typing…',
  'chat.typingMany': 'Several people are typing…',
  'chat.mention': 'Mention someone',

  'saved.title': 'Saved messages',
  'saved.empty': 'No saved messages yet',
  'saved.emptyBody': 'Press and hold any message, then choose “Save message” to keep it here.',

  'guardians.title': 'Family help',
  'guardians.settingsValue': 'Guardians who can help you',
  'guardians.requests': 'Requests for you',
  'guardians.whoHelpsMe': 'People who help me',
  'guardians.peopleIHelp': 'People I help',
  'guardians.askHelp': 'Ask someone to help me',
  'guardians.offerHelp': 'Offer to help someone',
  'guardians.accept': 'Accept',
  'guardians.decline': 'Decline',
  'guardians.remove': 'Remove',
  'guardians.removeConfirm': 'Remove {name} from family help?',
  'guardians.pending': 'Waiting for a reply',
  'guardians.wantsToHelp': '{name} would like to be your guardian.',
  'guardians.wantsYouToHelp': '{name} asked you to help look after them.',
  'guardians.lastCheckin': 'Checked in {time}',
  'guardians.noCheckin': 'No check-in yet',
  'guardians.manage': 'Help set up',
  'guardians.empty': 'No one yet',
  'guardians.emptyBody': 'A guardian is a trusted family member who can help you set things up and gets a gentle alert if you might need a hand.',
  'guardians.privacyNote': 'Guardians never see your messages. They can help with reminders and be alerted if you might need help.',
  'guardians.pickPerson': 'Choose a person',
  'guardians.offline': 'You need to be connected to do this.',
  'guardians.sent': 'Request sent',

  'dashboard.title': 'Family dashboard',
  'dashboard.settingsValue': 'The people you look after',
  'dashboard.empty': 'No one yet',
  'dashboard.emptyBody': 'When someone accepts your help, you’ll see how they’re doing here.',
  'dashboard.allGood': 'All good',
  'dashboard.medsOk': 'Medication on track',
  'dashboard.missedMeds': 'May have missed medication: {count}',
  'dashboard.message': 'Message',
  'dashboard.call': 'Call',
  'dashboard.setup': 'Set up',

  'ward.displaySection': 'Display on their phone',
  'ward.textSizeApplied': 'Updated — their phone will apply it',
  'ward.addContact': 'Add a contact for them',
  'ward.addContactHint': 'Phone number or @username',
  'ward.add': 'Add',
  'ward.contactAdded': 'Done — they can now chat with that person.',

  'reminders.title': 'Reminders',
  'reminders.settingsValue': 'Medication & appointments',
  'reminders.add': 'Add a reminder',
  'reminders.medication': 'Medication',
  'reminders.appointment': 'Appointment',
  'reminders.name': 'What is it?',
  'reminders.namePlaceholderMed': 'e.g. Blood pressure pill',
  'reminders.namePlaceholderAppt': 'e.g. Doctor Andersson',
  'reminders.time': 'Time',
  'reminders.day': 'Day',
  'reminders.morning': 'Morning',
  'reminders.noon': 'Midday',
  'reminders.afternoon': 'Afternoon',
  'reminders.evening': 'Evening',
  'reminders.night': 'Night',
  'reminders.notifyCaregiver': 'Also alert my family if I miss it',
  'reminders.save': 'Save reminder',
  'reminders.empty': 'No reminders yet',
  'reminders.emptyBody': 'Add a daily medication reminder or an appointment and Kinly will remind you.',
  'reminders.daily': 'Every day',
  'reminders.today': 'Today',
  'reminders.tomorrow': 'Tomorrow',
  'reminders.markTaken': 'Mark as taken',
  'reminders.takenToday': 'Taken today ✓',
  'reminders.markDone': 'Mark as done',
  'reminders.doneToday': 'Done ✓',
  'reminders.delete': 'Delete reminder',
  'reminders.deleteConfirm': 'Remove “{title}”?',

  'album.title': 'Photos',
  'album.empty': 'No photos yet',
  'album.emptyBody': 'Photos you and {name} share will appear here.',

  'group.admin': 'Admin',
  'group.makeAdmin': 'Make admin',
  'group.removeAdmin': 'Remove as admin',
  'group.lastAdmin': 'A group needs at least one admin.',
  'group.onlyAdmins': 'Only group admins can rename the group or change members.',
  'group.inviteLink': 'Invite link',
  'group.shareInvite': 'Share invite link',
  'group.inviteBody': 'Anyone with this link can join the group.',
  'group.inviteMessage': 'Join our group "{title}" on Kinly. Tap the link or enter the code {code} in the app:\n{link}',
  'group.inviteError': 'Could not create an invite link right now. Please try again.',

  'join.title': 'Join a group',
  'join.prompt': 'Enter the invite code a family member shared with you.',
  'join.code': 'Invite code',
  'join.join': 'Join group',
  'join.joining': 'Joining…',
  'join.error': 'That invite code is not valid. Please check it and try again.',
  'join.offline': 'You need to be connected to join a group.',

  'display.textSize': 'Text size',
  'display.appearance': 'Appearance',
  'display.language': 'Language',
  'display.normal': 'Normal',
  'display.large': 'Large',
  'display.xlarge': 'Extra large',
  'display.light': 'Light',
  'display.dark': 'Dark',
  'display.auto': 'Automatic',
  'display.langSystem': 'Phone language',
  'display.simpleMode': 'Simple mode',
  'display.simpleModeHint': 'Home shows only big buttons for your favorite people.',
};

const sv: Record<string, string> = {
  'common.cancel': 'Avbryt',
  'common.done': 'Klar',
  'common.save': 'Spara',
  'common.next': 'Nästa',
  'common.skip': 'Hoppa över',
  'common.getStarted': 'Kom igång',
  'common.loading': 'Laddar…',

  'tabs.messages': 'Meddelanden',
  'tabs.assistant': 'Assistent',
  'tabs.settings': 'Inställningar',

  'onboarding.welcome.title': 'Välkommen till Kinly',
  'onboarding.welcome.body': 'Ett enkelt och privat sätt att hålla kontakten med familj och vänner.',
  'onboarding.readable.title': 'Stort och lättläst',
  'onboarding.readable.body': 'Allt är stort och tydligt. Du kan göra texten ännu större under Inställningar → Skärm.',
  'onboarding.assistant.title': 'Fråga bara',
  'onboarding.assistant.body':
    'Tryck på ✨ Assistent-knappen och säg vad du vill — som "Ring Maria" eller "Säg till Tom att jag blir sen".',
  'onboarding.private.title': 'Privat som standard',
  'onboarding.private.body':
    'Dina meddelanden är totalsträckskrypterade. Bara du och din familj kan läsa dem — inte ens vi.',

  'auth.welcome': 'Välkommen till Kinly',
  'auth.signinSub': 'Logga in för att prata med din familj.',
  'auth.signupSub': 'Skapa ett konto för att komma igång.',
  'auth.name': 'Ditt namn',
  'auth.phone': 'Telefonnummer',
  'auth.phoneHint': 'Familjen lägger till dig med ditt telefonnummer.',
  'auth.email': 'E-post',
  'auth.password': 'Lösenord',
  'auth.passwordHint': 'Minst 8 tecken',
  'auth.signin': 'Logga in',
  'auth.createAccount': 'Skapa konto',
  'auth.forgot': 'Glömt lösenordet?',
  'auth.toSignup': 'Ny här? Skapa ett konto',
  'auth.toSignin': 'Har du redan ett konto? Logga in',

  'messages.search': 'Sök meddelanden och personer',
  'messages.noChats': 'Inga chattar än',
  'messages.noChatsBody': 'Lägg till en familjemedlem eller vän med deras telefonnummer för att börja prata.',
  'messages.addPerson': 'Lägg till en person',
  'messages.newGroup': 'Ny grupp',
  'messages.joinGroup': 'Gå med i en grupp',
  'messages.addTitle': 'Lägg till',
  'messages.addPrompt': 'Vad vill du göra?',
  'messages.allChats': 'Visa alla chattar',
  'messages.backToSimple': 'Tillbaka till enkel vy',
  'messages.getHelp': 'Få hjälp — ring {name}',
  'messages.people': 'Personer',
  'messages.messages': 'Meddelanden',
  'messages.noMatches': 'Inga träffar. Prova ett annat ord.',

  'settings.member': 'Kinly-medlem',
  'settings.you': 'Du',
  'settings.editProfile': 'Redigera profil',
  'settings.connection': 'Anslutning',
  'settings.connected': 'Ansluten',
  'settings.onThisDevice': 'På den här enheten',
  'settings.readAloud': 'Läs upp meddelanden',
  'settings.readAloudValue': 'På — tryck på högtalaren på valfritt meddelande',
  'settings.display': 'Skärm',
  'settings.displayValue': 'Textstorlek och mörkt läge',
  'settings.appLock': 'Applås',
  'settings.appLockUnavailable': 'Inte tillgängligt på den här enheten',
  'settings.appLockOn': 'På — Face ID / fingeravtryck / lösenkod',
  'settings.appLockOff': 'Av — tryck för att kräva upplåsning',
  'settings.encryption': 'Kryptering',
  'settings.encryptionValue': 'Återställningsfras och nycklar',
  'settings.emergency': 'Nödkontakt',
  'settings.emergencyNotSet': 'Inte inställd — tryck för att välja',
  'settings.checkin': 'Daglig incheckning',
  'settings.checkinValue': 'Låt din familj veta att du mår bra',
  'settings.language': 'Språk',
  'settings.help': 'Hjälp',
  'settings.about': 'Om Kinly',
  'settings.version': 'Version {version}',
  'settings.signOut': 'Logga ut',
  'settings.signOutConfirm': 'Är du säker på att du vill logga ut?',

  'chat.writeMessage': 'Skriv ett meddelande…',
  'chat.photos': 'Foton',
  'chat.pin': 'Fäst',
  'chat.unpin': 'Ta bort fäst',
  'chat.pinned': 'Fäst meddelande',
  'chat.save': 'Spara meddelande',
  'chat.unsave': 'Ta bort från sparade',
  'chat.forward': 'Vidarebefordra',
  'chat.forwardTo': 'Vidarebefordra till…',
  'chat.search': 'Sök i chatten',
  'chat.searchPlaceholder': 'Sök i den här konversationen',
  'chat.noResults': 'Inga meddelanden matchar din sökning.',
  'chat.typingOne': '{name} skriver…',
  'chat.typingMany': 'Flera personer skriver…',
  'chat.mention': 'Nämn någon',

  'saved.title': 'Sparade meddelanden',
  'saved.empty': 'Inga sparade meddelanden än',
  'saved.emptyBody': 'Håll in ett meddelande och välj ”Spara meddelande” för att spara det här.',

  'guardians.title': 'Familjehjälp',
  'guardians.settingsValue': 'Personer som kan hjälpa dig',
  'guardians.requests': 'Förfrågningar till dig',
  'guardians.whoHelpsMe': 'Personer som hjälper mig',
  'guardians.peopleIHelp': 'Personer jag hjälper',
  'guardians.askHelp': 'Be någon om hjälp',
  'guardians.offerHelp': 'Erbjud dig att hjälpa någon',
  'guardians.accept': 'Acceptera',
  'guardians.decline': 'Avböj',
  'guardians.remove': 'Ta bort',
  'guardians.removeConfirm': 'Ta bort {name} från familjehjälp?',
  'guardians.pending': 'Väntar på svar',
  'guardians.wantsToHelp': '{name} vill vara din guardian.',
  'guardians.wantsYouToHelp': '{name} bad dig att hjälpa till.',
  'guardians.lastCheckin': 'Incheckad {time}',
  'guardians.noCheckin': 'Ingen incheckning än',
  'guardians.manage': 'Hjälp till att ställa in',
  'guardians.empty': 'Ingen än',
  'guardians.emptyBody': 'En guardian är en betrodd familjemedlem som kan hjälpa dig att ställa in saker och får en påminnelse om du kan behöva hjälp.',
  'guardians.privacyNote': 'Guardians ser aldrig dina meddelanden. De kan hjälpa till med påminnelser och meddelas om du kan behöva hjälp.',
  'guardians.pickPerson': 'Välj en person',
  'guardians.offline': 'Du måste vara ansluten för att göra detta.',
  'guardians.sent': 'Förfrågan skickad',

  'dashboard.title': 'Familjeöversikt',
  'dashboard.settingsValue': 'Personerna du hjälper',
  'dashboard.empty': 'Ingen än',
  'dashboard.emptyBody': 'När någon accepterar din hjälp ser du hur de mår här.',
  'dashboard.allGood': 'Allt ser bra ut',
  'dashboard.medsOk': 'Medicin enligt plan',
  'dashboard.missedMeds': 'Kan ha missat medicin: {count}',
  'dashboard.message': 'Meddelande',
  'dashboard.call': 'Ring',
  'dashboard.setup': 'Ställ in',

  'ward.displaySection': 'Skärmen på deras telefon',
  'ward.textSizeApplied': 'Uppdaterat — deras telefon tillämpar det',
  'ward.addContact': 'Lägg till en kontakt åt dem',
  'ward.addContactHint': 'Telefonnummer eller @användarnamn',
  'ward.add': 'Lägg till',
  'ward.contactAdded': 'Klart — de kan nu chatta med den personen.',

  'reminders.title': 'Påminnelser',
  'reminders.settingsValue': 'Medicin och möten',
  'reminders.add': 'Lägg till en påminnelse',
  'reminders.medication': 'Medicin',
  'reminders.appointment': 'Möte',
  'reminders.name': 'Vad gäller det?',
  'reminders.namePlaceholderMed': 't.ex. Blodtrycksmedicin',
  'reminders.namePlaceholderAppt': 't.ex. Doktor Andersson',
  'reminders.time': 'Tid',
  'reminders.day': 'Dag',
  'reminders.morning': 'Morgon',
  'reminders.noon': 'Middag',
  'reminders.afternoon': 'Eftermiddag',
  'reminders.evening': 'Kväll',
  'reminders.night': 'Natt',
  'reminders.notifyCaregiver': 'Meddela även min familj om jag missar den',
  'reminders.save': 'Spara påminnelse',
  'reminders.empty': 'Inga påminnelser än',
  'reminders.emptyBody': 'Lägg till en daglig medicinpåminnelse eller ett möte så påminner Kinly dig.',
  'reminders.daily': 'Varje dag',
  'reminders.today': 'Idag',
  'reminders.tomorrow': 'Imorgon',
  'reminders.markTaken': 'Markera som tagen',
  'reminders.takenToday': 'Tagen idag ✓',
  'reminders.markDone': 'Markera som klar',
  'reminders.doneToday': 'Klar ✓',
  'reminders.delete': 'Ta bort påminnelse',
  'reminders.deleteConfirm': 'Ta bort ”{title}”?',

  'album.title': 'Foton',
  'album.empty': 'Inga foton än',
  'album.emptyBody': 'Foton som du och {name} delar visas här.',

  'group.admin': 'Admin',
  'group.makeAdmin': 'Gör till admin',
  'group.removeAdmin': 'Ta bort som admin',
  'group.lastAdmin': 'En grupp behöver minst en admin.',
  'group.onlyAdmins': 'Bara gruppens admins kan byta namn på gruppen eller ändra medlemmar.',
  'group.inviteLink': 'Inbjudningslänk',
  'group.shareInvite': 'Dela inbjudningslänk',
  'group.inviteBody': 'Alla med den här länken kan gå med i gruppen.',
  'group.inviteMessage': 'Gå med i vår grupp "{title}" på Kinly. Tryck på länken eller ange koden {code} i appen:\n{link}',
  'group.inviteError': 'Kunde inte skapa en inbjudningslänk just nu. Försök igen.',

  'join.title': 'Gå med i en grupp',
  'join.prompt': 'Ange inbjudningskoden som en familjemedlem delade med dig.',
  'join.code': 'Inbjudningskod',
  'join.join': 'Gå med i grupp',
  'join.joining': 'Går med…',
  'join.error': 'Inbjudningskoden är inte giltig. Kontrollera den och försök igen.',
  'join.offline': 'Du måste vara ansluten för att gå med i en grupp.',

  'display.textSize': 'Textstorlek',
  'display.appearance': 'Utseende',
  'display.language': 'Språk',
  'display.normal': 'Normal',
  'display.large': 'Stor',
  'display.xlarge': 'Extra stor',
  'display.light': 'Ljust',
  'display.dark': 'Mörkt',
  'display.auto': 'Automatiskt',
  'display.langSystem': 'Telefonens språk',
  'display.simpleMode': 'Enkelt läge',
  'display.simpleModeHint': 'Hemskärmen visar bara stora knappar för dina favoritpersoner.',
};

const CATALOGS: Record<Lang, Record<string, string>> = { en, sv };
const KEY = 'kinly.locale.v1';

function deviceLang(): Lang {
  try {
    const code = getLocales()[0]?.languageCode?.toLowerCase();
    return code === 'sv' ? 'sv' : 'en';
  } catch {
    return 'en';
  }
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

type I18nValue = { t: TFn; lang: Lang; pref: LangPref; setPref: (p: LangPref) => void };
const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [pref, setPrefState] = useState<LangPref>('system');

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'en' || v === 'sv' || v === 'system') setPrefState(v);
      })
      .catch(() => {});
  }, []);

  const setPref = useCallback((p: LangPref) => {
    setPrefState(p);
    AsyncStorage.setItem(KEY, p).catch(() => {});
  }, []);

  const lang: Lang = pref === 'system' ? deviceLang() : pref;

  const t = useCallback<TFn>(
    (key, vars) => {
      let s = CATALOGS[lang][key] ?? en[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
      return s;
    },
    [lang]
  );

  const value = useMemo<I18nValue>(() => ({ t, lang, pref, setPref }), [t, lang, pref, setPref]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useTranslation must be used inside <I18nProvider>');
  return ctx;
}
