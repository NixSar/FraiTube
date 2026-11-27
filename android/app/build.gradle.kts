plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "io.github.nixsar.fraitube"
    compileSdk = 37

    defaultConfig {
        applicationId = "io.github.nixsar.fraitube"
        minSdk = 30
        targetSdk = 37
        versionCode = 1
        versionName = "0.9.9"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    androidTestImplementation(libs.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.ext.junit)
}
