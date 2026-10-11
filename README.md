# جناح المقلاع - نسخة أندرويد (Capacitor)

مشروع يغلّف اللعبة كتطبيق أندرويد. لم يتم بناء APK داخل هذه البيئة، فالخطوات أدناه تُنفَّذ على جهازك.

## المتطلبات
- Node.js 18 أو أحدث
- Android Studio (يتضمن Android SDK و JDK 17)

## الخطوات
1. `npm install`
2. `npm run prepare-www`  (ينسخ اللعبة إلى www ويضمّن three.js محليًا)
3. `npx cap add android`  (مرة واحدة فقط)
4. `npm run sync`
5. `npm run open`  ثم من Android Studio: Build > Build APK(s)
   أو من الطرفية: `npm run apk`  والناتج في android/app/build/outputs/apk/debug/

بعد أي تعديل في src/ أعد تنفيذ `npm run sync`.

## ضبط ما قبل النشر
- غيّر `appId` في capacitor.config.json (مثلًا com.yourname.slingwing). لا يمكن تغييره بعد النشر.
- اجعل الاتجاه عموديًا: في android/app/src/main/AndroidManifest.xml أضف
  `android:screenOrientation="portrait"` إلى وسم activity.
- الأيقونة وشاشة البداية: ضع icon.png (1024x1024) و splash.png (2732x2732) في مجلد assets
  ثم نفّذ `npx @capacitor/assets generate --android`.
- الخطوط (Cairo و Lalezar) تُحمَّل من الإنترنت. دون اتصال يُستخدم خط النظام. لتضمينها محليًا ثبّت
  @fontsource/cairo و @fontsource/lalezar وعدّل index.html.

## النشر على Google Play
1. أنشئ مفتاح توقيع: `keytool -genkey -v -keystore release.jks -alias slingwing -keyalg RSA -keysize 2048 -validity 10000`
   واحتفظ به وبكلمة مروره في مكان آمن (لا ترفعه إلى git).
2. ابنِ حزمة AAB: `npm run bundle` ووقّعها في Android Studio (Build > Generate Signed Bundle).
3. ارفعها في Google Play Console (رسوم المطوّر مرة واحدة 25 دولارًا) وأكمل بيانات المتجر وسياسة الخصوصية.

## الهيكل
- src/ : ملفات اللعبة (index.html, css/, js/game.js)
- scripts/prepare.js : يجهّز www
- capacitor.config.json : إعدادات التطبيق
