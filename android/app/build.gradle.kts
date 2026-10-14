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
        // Cada build ganha um número de versão maior que o anterior (minutos desde 01/2025),
        // venha do GitHub ou do Android Studio; assim o Android aceita o APK novo como atualização.
        versionCode = (System.currentTimeMillis() / 60_000L - 29_000_000L).toInt()
        versionName = "1.0.$versionCode"
    }

    // Assinatura fixa: APKs gerados no GitHub ou no Android Studio têm a mesma assinatura,
    // então um APK novo instala por cima do anterior sem apagar os dados.
    // Chave de uso pessoal (instalação direta). Para publicar na Play Store, gere uma chave própria e secreta.
    signingConfigs {
        create("app") {
            storeFile = file("vendas.keystore")
            storePassword = "vendasambulante"
            keyAlias = "vendas"
            keyPassword = "vendasambulante"
        }
    }

    buildTypes {
        getByName("debug") {
            signingConfig = signingConfigs.getByName("app")
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("app")
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
