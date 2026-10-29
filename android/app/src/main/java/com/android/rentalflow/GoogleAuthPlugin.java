package com.android.rentalflow;

import android.os.CancellationSignal;

import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

/** Returns a Google ID token through Credential Manager so the app never opens a browser. */
@CapacitorPlugin(name = "GoogleAuth")
public class GoogleAuthPlugin extends Plugin {

    @PluginMethod
    public void signIn(PluginCall call) {
        String serverClientId = call.getString("serverClientId");
        if (serverClientId == null || serverClientId.isEmpty()) {
            call.reject("errors.googleSetup", "GOOGLE_SETUP");
            return;
        }
        GetSignInWithGoogleOption option = new GetSignInWithGoogleOption.Builder(serverClientId)
                .build();
        GetCredentialRequest request = new GetCredentialRequest.Builder()
                .addCredentialOption(option)
                .build();
        CredentialManager.create(getContext()).getCredentialAsync(
                getActivity(),
                request,
                new CancellationSignal(),
                ContextCompat.getMainExecutor(getContext()),
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(GetCredentialResponse response) {
                        Credential credential = response.getCredential();
                        if (credential instanceof CustomCredential
                                && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                            try {
                                GoogleIdTokenCredential googleIdToken =
                                        GoogleIdTokenCredential.createFrom(((CustomCredential) credential).getData());
                                JSObject result = new JSObject();
                                result.put("idToken", googleIdToken.getIdToken());
                                call.resolve(result);
                            } catch (Exception error) {
                                call.reject("errors.googleFailed", "GOOGLE_FAILED");
                            }
                        } else {
                            call.reject("errors.googleFailed", "GOOGLE_FAILED");
                        }
                    }

                    @Override
                    public void onError(GetCredentialException error) {
                        if (error instanceof androidx.credentials.exceptions.GetCredentialCancellationException) {
                            call.reject("errors.googleCancelled", "GOOGLE_CANCELLED");
                        } else if (error instanceof androidx.credentials.exceptions.NoCredentialException) {
                            call.reject("errors.googleNoAccount", "GOOGLE_NO_ACCOUNT");
                        } else if (error instanceof androidx.credentials.exceptions.GetCredentialProviderConfigurationException
                                || error instanceof androidx.credentials.exceptions.GetCredentialUnsupportedException) {
                            call.reject("errors.googleSetup", "GOOGLE_SETUP");
                        } else {
                            call.reject("errors.googleFailed", "GOOGLE_FAILED");
                        }
                    }
                });
    }
}
