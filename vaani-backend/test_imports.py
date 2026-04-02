try:
    import services.stt
    import services.rag
    import services.llm
    import services.tts
    print('All imports successful')
except Exception as e:
    print(f'Import error: {e}')
    import traceback
    traceback.print_exc()