buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        // Chaquopy 17.0 支持的 AGP 区间是 7.3–9.2，模板默认的 9.3.1 超出范围，因此固定到 9.2.1
        classpath("com.android.tools.build:gradle:9.2.1")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.10")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

tasks.register("clean").configure {
    delete("build")
}

