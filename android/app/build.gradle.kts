plugins {
    id("com.android.application")
}

android {
    namespace = "br.com.vendasambulante"
    compileSdk = 35

    defaultConfig {
        // Para ter outro app instalado lado a lado, troque o applicationId.
        applicationId = "br.com.vendasambulante"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}
