from django.urls import path

from . import views

urlpatterns = [
    path('consent', views.consent, name='consent'),
    path('decide', views.decide, name='decide'),
    path('logout', views.logout, name='logout'),
]
