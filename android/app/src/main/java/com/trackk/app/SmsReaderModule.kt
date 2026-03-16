package com.trackk.app

import android.content.ContentResolver
import android.database.Cursor
import android.net.Uri
import android.provider.Telephony
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray

/**
 * Native module for reading SMS inbox history.
 * Used by AutoDetectionService.scanHistoricalSMS() to scan past SMS
 * for subscriptions, EMIs, and investments on first launch.
 */
class SmsReaderModule(private val reactContext: ReactApplicationContext)
    : ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "SmsReaderModule"

    /**
     * Read SMS messages from inbox.
     * @param maxCount Maximum number of messages to return
     * @param minDate Minimum date in milliseconds (only return SMS newer than this)
     * @param promise Resolves with a WritableArray of SMS objects [{body, address, date}, ...]
     */
    @ReactMethod
    fun readSms(maxCount: Int, minDate: Double, promise: Promise) {
        try {
            val resolver: ContentResolver = reactContext.contentResolver
            val uri: Uri = Telephony.Sms.Inbox.CONTENT_URI

            val projection = arrayOf(
                Telephony.Sms.BODY,
                Telephony.Sms.ADDRESS,
                Telephony.Sms.DATE
            )

            val selection = "${Telephony.Sms.DATE} > ?"
            val selectionArgs = arrayOf(minDate.toLong().toString())
            val sortOrder = "${Telephony.Sms.DATE} DESC"

            val cursor: Cursor? = resolver.query(
                uri, projection, selection, selectionArgs, sortOrder
            )

            val results: WritableArray = Arguments.createArray()
            var count = 0

            cursor?.use {
                val bodyIdx = it.getColumnIndex(Telephony.Sms.BODY)
                val addressIdx = it.getColumnIndex(Telephony.Sms.ADDRESS)
                val dateIdx = it.getColumnIndex(Telephony.Sms.DATE)

                while (it.moveToNext() && count < maxCount) {
                    val sms = Arguments.createMap().apply {
                        putString("body", it.getString(bodyIdx) ?: "")
                        putString("address", it.getString(addressIdx) ?: "")
                        putString("date", it.getLong(dateIdx).toString())
                    }
                    results.pushMap(sms)
                    count++
                }
            }

            promise.resolve(results)
        } catch (e: Exception) {
            promise.reject("SMS_READ_ERROR", "Failed to read SMS: ${e.message}", e)
        }
    }
}
