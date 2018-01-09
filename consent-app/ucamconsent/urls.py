from django.urls import path

from . import views

urlpatterns = [
    path('consent', views.consent, name='consent'),
]
