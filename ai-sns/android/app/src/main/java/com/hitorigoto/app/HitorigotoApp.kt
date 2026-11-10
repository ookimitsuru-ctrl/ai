package com.hitorigoto.app

import android.app.Application
import com.hitorigoto.app.data.DataStoreSessionStore
import com.hitorigoto.app.data.HttpSnsApi
import com.hitorigoto.app.data.SessionStore
import com.hitorigoto.app.data.SnsApi

/** 画面から使う部品をまとめて持つ(小さいアプリなので DI ライブラリは使わない) */
class AppContainer(val sessionStore: SessionStore, val api: SnsApi)

class HitorigotoApp : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        val store = DataStoreSessionStore(this)
        container = AppContainer(store, HttpSnsApi(store))
    }
}
