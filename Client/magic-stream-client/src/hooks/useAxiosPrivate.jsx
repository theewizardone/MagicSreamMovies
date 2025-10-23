import {useEffect, useRef} from 'react';
import axios from 'axios';

import useAuth from './useAuth';

const apiUrl = import.meta.env.VITE_API_BASE_URL;

const useAxiosPrivate = () =>{

    const {auth,setAuth} = useAuth();

    const isRefreshing = useRef(false);
    const failedQueue = useRef([]);
    const axiosAuthRef = useRef(null);

    if (!axiosAuthRef.current) {
        axiosAuthRef.current = axios.create({
            baseURL: apiUrl,
            withCredentials: true, // important for HTTP-only cookies
        });
    }

    const axiosAuth = axiosAuthRef.current;

    // Helper to process queued requests after token refresh
    const processQueue = (error, response = null) => {
        failedQueue.current.forEach(prom => {
            if (error) {
            prom.reject(error);
            } else {
            prom.resolve(response);
            }
        });

        failedQueue.current = [];
    };

     useEffect(() => {

        axiosAuth.interceptors.response.use(
        response => response,
        async error => {
            console.log('⚠ Interceptor caught error:', error);
            const originalRequest = error.config;

        if (originalRequest.url.includes('/refresh') && error.response.status === 401) {
            //edge case where the refresh token is invalid or expired
            console.error('❌ Refresh token has expired or is invalid.');
            return Promise.reject(error); // fail directly, no retry
        }

            if (error.response && error.response.status === 401 && !originalRequest._retry) {

                if (isRefreshing.current) {
                return new Promise((resolve, reject) => {
                failedQueue.current.push({ resolve, reject });
                })
                .then(() => axiosAuth(originalRequest))
                .catch(err => Promise.reject(err));
            }

            originalRequest._retry = true;
            isRefreshing.current = true;

            return new Promise((resolve, reject) => {
                axiosAuth
                .post('/refresh')
                .then(() => {
                
                    processQueue(null);

                axiosAuth(originalRequest)
                    .then(resolve)
                    .catch(reject);

                })
                .catch(refreshError => {

                        processQueue(refreshError, null);
                        
                        localStorage.removeItem('user');
                        setAuth(null); // Clear auth state
                        reject(refreshError); // fail the original promise chain
                })
                .finally(() => {
                        isRefreshing.current = false;
                });
            });
            }

            return Promise.reject(error);
        }
        );

    }, [auth, setAuth, axiosAuth]);

    return axiosAuth;
}

export default useAxiosPrivate;