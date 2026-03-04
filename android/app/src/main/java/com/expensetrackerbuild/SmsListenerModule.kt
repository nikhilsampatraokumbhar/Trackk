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
        if (!reactContext.hasActiveReactInstance()) {
            synchronized(pendingMessages) {
                pendingMessages.add(Pair(sender, body))
            }
            return
        }
        val params: WritableMap = Arguments.createMap().apply {
            putString("originatingAddress", sender)
            putString("body", body)
        }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("onSmsReceived", params)
    }

    private fun flushPendingMessages() {
        val toSend: List<Pair<String, String>>
        synchronized(pendingMessages) {
            toSend = pendingMessages.toList()
            pendingMessages.clear()
        }
        for ((sender, body) in toSend) {
            sendEvent(sender, body)
        }
    }

    companion object {
        @Volatile private var instance: SmsListenerModule? = null
        private val pendingMessages = mutableListOf<Pair<String, String>>()

        fun onSmsReceived(sender: String, body: String) {
            val mod = instance
            if (mod != null) {
                mod.sendEvent(sender, body)
            } else {
                synchronized(pendingMessages) {
                    pendingMessages.add(Pair(sender, body))
                }
            }
        }
    }

    init {
        instance = this
        // Flush any SMS that arrived before the module was initialized
        flushPendingMessages()
    }
}
