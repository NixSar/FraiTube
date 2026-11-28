plugins {
    alias(libs.plugins.android.application)
}

// The app carries the project's version, read from the package.json next to the android folder.
val projectVersion = Regex("\"version\"\\s*:\\s*\"(\\d+)\\.(\\d+)\\.(\\d+)\"")
    .find(rootProject.file("../package.json").readText())
    ?.groupValues?.drop(1)?.map { it.toInt() }
    ?: error("package.json has no version")

android {
    namespace = "io.github.nixsar.fraitube"
    compileSdk = 37

    defaultConfig {
        applicationId = "io.github.nixsar.fraitube"
        minSdk = 30
        targetSdk = 37
        // 0.9.10 becomes 9010, so every newer version has a higher number.
        versionCode = projectVersion[0] * 1_000_000 + projectVersion[1] * 1_000 + projectVersion[2]
        versionName = projectVersion.joinToString(".")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // The release key is given at build time and is never in the repository. Without it the release
    // build comes out unsigned, for a store that signs the app itself.
    val keyStoreFile = System.getenv("FRAITUBE_KEYSTORE_FILE")
    if (!keyStoreFile.isNullOrEmpty()) {
        signingConfigs {
            create("release") {
                storeFile = file(keyStoreFile)
                storePassword = System.getenv("FRAITUBE_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("FRAITUBE_KEY_ALIAS")
                keyPassword = System.getenv("FRAITUBE_KEY_PASSWORD")
            }
        }
        buildTypes {
            getByName("release") {
                signingConfig = signingConfigs.getByName("release")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // WebDAV needs request methods Android's own HTTP client refuses.
    implementation(libs.okhttp)
    androidTestImplementation(libs.okhttp.mockwebserver)
    androidTestImplementation(libs.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.ext.junit)
}
