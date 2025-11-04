#!/usr/bin/env python3
import sys
from cltk import NLP
from collections import defaultdict

def count_greek_words(text):
    """
    Count Koine Greek words, grouping different conjugations together.
    
    Args:
        text (str): Input string containing Koine Greek text
        
    Returns:
        dict: Dictionary with lemmatized words as keys and counts as values
    """
    # Initialize CLTK pipeline for Ancient Greek
    nlp = NLP(language="grc")
    
    # Process the text
    doc = nlp.analyze(text=text)
    
    # Count lemmatized words (base forms)
    word_counts = defaultdict(int)
    for word in doc.words:
        if word.lemma and word.lemma.strip():  # Skip empty lemmas
            word_counts[word.lemma.lower()] += 1
    
    return dict(word_counts)

if __name__ == "__main__":
    # Read from stdin
    input_text = sys.stdin.read()
    
    # Process the text
    word_counts = count_greek_words(input_text)
    
    # Sort by count (descending) then alphabetically
    sorted_words = sorted(word_counts.items(), key=lambda x: (-x[1], x[0]))
    
    # Output TSV header
    print("word\tcount")
    
    # Output results
    for word, count in sorted_words:
        print(f"{word}\t{count}")
