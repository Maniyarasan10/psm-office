# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# React Native / Hermes
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.soloader.** { *; }

# React Native Reanimated
-keep class com.swmansion.reanimated.** { *; }

# React Native TurboModules
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.uimanager.** { *; }

# Expo
-keep class expo.modules.** { *; }
-keep class expo.modules.updates.** { *; }
-keep class expo.modules.camera.** { *; }
-keep class expo.modules.location.** { *; }
-keep class expo.modules.notifications.** { *; }
-keep class expo.modules.filesystem.** { *; }
-keep class expo.modules.imagepicker.** { *; }
-keep class expo.modules.systemui.** { *; }

# AsyncStorage
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# Vector Icons
-keep class com.oblador.vectoricons.** { *; }

# Safe Area Context
-keep class com.th3rdwave.safeareacontext.** { *; }

# Screens
-keep class com.swmansion.rnscreens.** { *; }

# NetInfo
-keep class com.reactnativecommunity.netinfo.** { *; }

# Google Services / Firebase
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# OkHttp / Okio
-keep class okhttp3.** { *; }
-keep class okio.** { *; }

# Kotlin Coroutines
-keep class kotlinx.coroutines.** { *; }

# Gson
-keep class com.google.gson.** { *; }

# Prevent ProGuard from stripping annotation classes
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes InnerClasses
-keepattributes EnclosingMethod

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep Parcelable implementations
-keep class * implements android.os.Parcelable {
    public static final ** CREATOR;
}

# Keep Enum values
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}

# Add any project specific keep options here:

# KotlinPoet (used by codegen)
-dontwarn com.squareup.kotlinpoet.**
-keep class com.squareup.kotlinpoet.** { *; }

# Missing javax.lang.model classes referenced by kotlinpoet
-dontwarn javax.lang.model.**
-dontnote javax.lang.model.**

# Keep all React Native and Expo classes that use reflection
-keep class com.facebook.react.** { *; }
-keep class expo.modules.** { *; }

# Keep AsyncStorage
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# Keep all model/data classes for JSON serialization
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# Prevent stripping of native method names
-keepclasseswithmembernames class * {
    native <methods>;
}

# Keep Parcelable creators
-keep class * implements android.os.Parcelable {
    public static final ** CREATOR;
}

# Keep Enum values
-keepclassmembers enum * {
    public static **[] values();
    public static ** valueOf(java.lang.String);
}