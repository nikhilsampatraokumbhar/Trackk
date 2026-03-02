package com.expensetrackerbuild

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != "android.provider.Telephony.SMS_RECEIVED") return
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isNullOrEmpty()) return
        val sender = messages[0].originatingAddress ?: return
        // Concatenate all parts (handles multi-part SMS)
        val body = messages.joinToString("") { it.messageBody ?: "" }
        SmsListenerModule.onSmsReceived(sender, body)
    }
}
