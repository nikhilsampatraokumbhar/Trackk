package com.expensetrackerbuild

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

class SmsListenerModule(private val reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "SmsListenerModule"

    // Required by React Native's NativeEventEmitter
    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    private fun sendEvent(sender: String, body: String) {
        val params: WritableMap = Arguments.createMap().apply {
            putString("originatingAddress", sender)
            putString("body", body)
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onSmsReceived", params)
    }

    companion object {
        @Volatile private var instance: SmsListenerModule? = null

        fun onSmsReceived(sender: String, body: String) {
            instance?.sendEvent(sender, body)
        }
    }

    init {
        instance = this
    }
}
