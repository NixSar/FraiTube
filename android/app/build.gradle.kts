plugins {
    alias(libs.plugins.android.application)
}

// The app carries the project's version and Android version number, read from the package.json next to
// the android folder. A suffix such as -beta.1 is left out of the app's version.
val packageJson = rootProject.file("../package.json").readText()
val projectVersion = Regex("\"version\"\\s*:\\s*\"(\\d+\\.\\d+\\.\\d+)[\"-]")
    .find(packageJson)?.groupValues?.get(1)
    ?: error("package.json has no version")
val projectVersionCode = Regex("\"androidVersionCode\"\\s*:\\s*(\\d+)")
    .find(packageJson)?.groupValues?.get(1)?.toInt()
    ?: error("package.json has no androidVersionCode")

android {
    namespace = "io.github.nixsar.fraitube"
    compileSdk = 37

    defaultConfig {
        applicationId = "io.github.nixsar.fraitube"
        minSdk = 30
        targetSdk = 37
        versionCode = projectVersionCode
        versionName = projectVersion
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // The release app comes out unsigned and is signed by scripts/android-release.sh. It carries no Git
    // details, so F-Droid's build of a tag matches the published one.
    buildTypes {
        getByName("release") {
            vcsInfo.include = false
        }
    }

    // The list of libraries that the build tools add to a signed app in a form only Google reads is
    // left out; F-Droid does not accept an app that carries it.
    dependenciesInfo {
        includeInApk = false
        includeInBundle = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// The app's pages are built by pnpm, not by Gradle. Packing the app without them would give an app
// that shows nothing, so the build stops and says what to run.
val checkPages = tasks.register("checkPages") {
    val page = layout.projectDirectory.file("src/main/assets/web/index.html").asFile
    doLast {
        if (!page.isFile) {
            throw GradleException("The app's pages are missing. Run first, in the project folder: pnpm --filter @fraitube/android-web build")
        }
    }
}
tasks.named("preBuild") { dependsOn(checkPages) }

dependencies {
    // WebDAV needs request methods Android's own HTTP client refuses.
    implementation(libs.okhttp)
    androidTestImplementation(libs.okhttp.mockwebserver)
    androidTestImplementation(libs.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.ext.junit)
}
